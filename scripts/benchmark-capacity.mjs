// Benchmark isolado: processos separados, contas fictícias e somente loopback.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createLocalServer } from '../src/server.js';
import { initializeWallet } from '../src/points.js';
import { distribution, decodeSelfPosition } from './load-test-production.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const count = Number(process.argv[2] ?? 1000),
  seconds = Number(process.argv[3] ?? 35);
if (
  process.argv.length > 4 ||
  !Number.isInteger(count) ||
  count < 1 ||
  count > 1000 ||
  !Number.isInteger(seconds) ||
  seconds < 5 ||
  seconds > 300
)
  throw Error('Uso: node scripts/benchmark-capacity.mjs [1..1000] [5..300 segundos]');
const token = (i) => (i + 1).toString(16).padStart(64, '0');
if (process.env.MANIFESTACAO_BENCHMARK_CHILD === '1') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifestacao-capacity-'));
  const app = await createLocalServer({
    dataDir: dir,
    port: 0,
    maxPlayers: count,
    wsMaxConnections: count + 100,
  });
  // O transporte fica em loopback; elegibilidade e progresso seguem regras públicas.
  app.ctx.production = true;
  app.ctx.config = { ...app.ctx.config, production: true };
  for (let i = 0; i < count; i++) {
    const user = {
      id: `fixture-${i}`,
      nick: `Carga${i}`,
      verified: true,
      nickPending: false,
    };
    initializeWallet(app.ctx.state, user);
    app.ctx.state.users.push(user);
    app.ctx.state.sessions[token(i)] = {
      userId: user.id,
      expiresAt: Date.now() + 3600000,
    };
  }
  app.ctx.save();
  await app.ctx.persistence.flush();
  const address = await app.listen();
  const lag = monitorEventLoopDelay({ resolution: 10 });
  lag.enable();
  const cpu = process.cpuUsage();
  const at = performance.now();
  process.send({ type: 'ready', url: `ws://127.0.0.1:${address.port}/ws` });
  let childStopping = false;
  async function cleanup() {
    if (childStopping) return;
    childStopping = true;
    lag.disable();
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    if (process.connected) process.disconnect();
  }
  process.on('disconnect', () => cleanup());
  process.on('message', async (m) => {
    if (m === 'metrics') {
      const used = process.cpuUsage(cpu);
      process.send({
        type: 'metrics',
        ...app.realtime.metrics(),
        rss: process.memoryUsage().rss,
        cpuPercent: Math.round((used.user + used.system) / (performance.now() - at)) / 10,
        eventLoopP95Ms: Math.round(lag.percentile(95) / 1e4) / 100,
        eventLoopMaxMs: Math.round(lag.max / 1e4) / 100,
        stateBytes: Buffer.byteLength(JSON.stringify(app.ctx.state)),
      });
    }
    if (m === 'stop') await cleanup();
  });
} else {
  const child = fork(fileURLToPath(import.meta.url), [String(count), String(seconds)], {
    env: { ...process.env, MANIFESTACAO_BENCHMARK_CHILD: '1' },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  const clients = [],
    errors = [],
    joins = [],
    rtts = [];
  let url,
    stopping = false,
    timer,
    bytes = 0,
    maxNear = 0,
    overviewCount = 0;
  const waitMessage = (type) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.off('message', on);
        reject(Error(`Timeout ${type}`));
      }, 15000);
      function on(m) {
        if (m.type === type) {
          clearTimeout(timeout);
          child.off('message', on);
          resolve(m);
        }
      }
      child.on('message', on);
    });
  async function close(c) {
    c.expected = true;
    if (c.ws.readyState === WebSocket.CLOSED) return;
    await new Promise((r) => {
      const t = setTimeout(() => {
        c.ws.terminate();
        r();
      }, 1000);
      c.ws.once('close', () => {
        clearTimeout(t);
        r();
      });
      c.ws.close(1000);
    });
  }
  async function connect(i, previous) {
    const c = {
      index: i,
      ws: new WebSocket(url, {
        origin: url.replace('ws:', 'http:').replace('/ws', ''),
        headers: {
          Cookie: `local_session=${token(i)}`,
          'X-Real-IP': `198.18.${Math.floor(i / 254)}.${(i % 254) + 1}`,
        },
      }),
      seq: 0,
      pending: new Map(),
      snapshots: 0,
      moved: 0,
      heartbeat: 0,
      overviewSnapshots: 0,
    };
    clients.push(c);
    await new Promise((resolve, reject) => {
      const start = performance.now(),
        t = setTimeout(() => reject(Error(`Welcome ${i}`)), 15000);
      c.ws.on('error', (e) => {
        errors.push(e.message);
        clearTimeout(t);
        reject(e);
      });
      c.ws.on('ping', () => c.heartbeat++);
      c.ws.on('close', (code) => {
        if (!stopping && !c.expected) errors.push(`Desconexão ${code}`);
      });
      c.ws.once('open', () =>
        c.ws.send(
          JSON.stringify({
            t: 'join',
            nick: `Carga${i}`,
            team: i % 3,
            character: 0,
            ...(previous ? { token: previous.token } : {}),
          }),
        ),
      );
      c.ws.on('message', (data, binary) => {
        bytes += data.length;
        if (binary) {
          if (data[0] === 1) {
            maxNear = Math.max(maxNear, data.readUInt16LE(5));
            const p = decodeSelfPosition(data, c.id);
            if (p) {
              c.snapshots++;
              c.first ??= p;
              c.moved = Math.max(c.moved, Math.hypot(p.x - c.first.x, p.z - c.first.z));
            }
          } else if (data[0] === 2) {
            c.overviewSnapshots++;
            overviewCount = Math.max(overviewCount, data.readUInt16LE(5));
          }
          return;
        }
        const m = JSON.parse(data);
        if (m.t === 'welcome') {
          c.id = m.id;
          c.token = m.token;
          joins.push(performance.now() - start);
          clearTimeout(t);
          resolve(c);
        }
        if (m.t === 'pong' && c.pending.has(m.at)) {
          rtts.push(performance.now() - c.pending.get(m.at));
          c.pending.delete(m.at);
        }
      });
    });
    return c;
  }
  const report = {
    at: new Date().toISOString(),
    scope:
      'Loopback com servidor em processo separado, JSON temporário, contas fictícias autenticadas; sem VPS, Cloudflare, PostgreSQL ou browsers reais.',
    requested: count,
    seconds,
    errors,
  };
  try {
    ({ url } = await waitMessage('ready'));
    assert.equal(new URL(url).hostname, '127.0.0.1');
    const active = [];
    for (let i = 0; i < count; i += 25) {
      active.push(
        ...(await Promise.all(
          Array.from({ length: Math.min(25, count - i) }, (_, j) => connect(i + j)),
        )),
      );
      if ((i + 25) % 100 === 0) console.error('Clientes conectados:', active.length);
    }
    const settled = waitMessage('metrics');
    child.send('metrics');
    const before = await settled;
    assert.equal(before.players, count);
    const start = performance.now(),
      bytesBefore = bytes;
    let cycle = 0;
    timer = setInterval(() => {
      cycle++;
      for (const c of active) {
        if (c.ws.readyState !== WebSocket.OPEN) continue;
        c.ws.send(
          JSON.stringify({
            t: 'input',
            x: 0,
            z: Math.floor(cycle / 20) % 2 ? -1 : 1,
            seq: ++c.seq,
          }),
        );
        if (cycle % 10 === 0) {
          const at = Date.now();
          c.pending.set(at, performance.now());
          c.ws.send(JSON.stringify({ t: 'ping', at }));
        }
      }
    }, 100);
    await sleep(seconds * 1000);
    report.steadyReceivedBytesPerSecond = Math.round(
      (bytes - bytesBefore) / ((performance.now() - start) / 1000),
    );
    report.moved = active.filter((c) => c.moved >= 0.1).length;
    report.minimumNearSnapshots = Math.min(...active.map((c) => c.snapshots));
    report.minimumOverviewSnapshots = Math.min(...active.map((c) => c.overviewSnapshots));
    report.heartbeatClients = active.filter((c) => c.heartbeat > 0).length;
    report.reconnected = 0;
    for (let i = 0; i < Math.min(20, count); i++) {
      const old = active[i];
      await close(old);
      const next = await connect(i, old);
      assert.equal(next.id, old.id);
      assert.equal(next.token, old.token);
      active[i] = next;
      report.reconnected++;
    }
    await sleep(2000);
    clearInterval(timer);
    report.capacityRejection = await new Promise((resolve, reject) => {
      const ws = new WebSocket(url, {
        origin: url.replace('ws:', 'http:').replace('/ws', ''),
        headers: { 'X-Real-IP': '198.19.1.1' },
      });
      const t = setTimeout(() => {
        ws.terminate();
        reject(Error('Capacidade'));
      }, 5000);
      ws.on('error', reject);
      ws.on('open', () => ws.send(JSON.stringify({ t: 'join', nick: 'Excedente' })));
      ws.on('close', (code) => {
        clearTimeout(t);
        resolve(code);
      });
    });
    const metric = waitMessage('metrics');
    child.send('metrics');
    report.server = await metric;
    report.joinMs = distribution(joins);
    report.rttMs = distribution(rtts);
    report.maxNearAcrossRamp = maxNear;
    report.overviewCount = overviewCount;
    assert.equal(report.moved, count);
    assert.ok(report.minimumNearSnapshots >= Math.floor(seconds * 5));
    assert.ok(report.minimumOverviewSnapshots >= Math.floor(seconds / 2));
    if (seconds >= 30) assert.equal(report.heartbeatClients, count);
    assert.equal(report.server.players, count);
    assert.equal(report.capacityRejection, 1013);
    assert.equal(errors.length, 0);
    assert.ok(report.server.tickP95Ms < 50, 'p95 do tick deve caber em50ms');
    assert.equal(report.server.slowConsumers, 0);
    if (count > 128) {
      assert.equal(overviewCount, count);
      assert.ok(report.server.maxNearActors <= 128);
    }
    report.ok = true;
  } catch (e) {
    errors.push(e.message);
    console.error('Falha de carga:', e.message);
    report.ok = false;
    process.exitCode = 1;
  } finally {
    stopping = true;
    clearInterval(timer);
    await Promise.all(clients.map(close));
    try {
      for (let i = 0; i < 20; i++) {
        const metric = waitMessage('metrics');
        child.send('metrics');
        report.playersAfterClose = (await metric).players;
        if (report.playersAfterClose === 0) break;
        await sleep(250);
      }
      if (report.playersAfterClose !== 0) {
        errors.push('Limpeza não concluiu');
        report.ok = false;
        process.exitCode = 1;
      }
    } finally {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      if (child.connected) child.send('stop');
      else child.kill('SIGTERM');
      await exited;
    }
    const folder = new URL('../analysis/capacity-1000/', import.meta.url);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(
      new URL(`benchmark-${count}.json`, folder),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(JSON.stringify(report, null, 2));
  }
}
