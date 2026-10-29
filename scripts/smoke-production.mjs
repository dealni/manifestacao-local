import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { WebSocket } from 'ws';
import { decodeSelfPosition } from './load-test-production.mjs';

// Smoke público deliberadamente pequeno: dois visitantes próprios, sem falas,
// contas, uploads, microfone ou captura de dados de outros participantes.
const origin = 'https://manifestacoes.com';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = {
  generatedAt: new Date().toISOString(),
  origin,
  checks: {},
  errors: [],
  privacy:
    'Apenas resultados agregados e posições dos dois clientes próprios; nenhum token, nick ou IP armazenado.',
};
const clients = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fetchCheck(route, method = 'GET') {
  const start = performance.now();
  const res = await fetch(origin + route, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  const body = method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer());
  const text = body.toString('utf8');
  const result = {
    status: res.status,
    durationMs: Math.round(performance.now() - start),
    contentType: res.headers.get('content-type'),
  };
  assert.equal(res.status, 200, `${method} ${route}: HTTP ${res.status}`);
  return { result, text, body };
}
async function close(client) {
  if (!client || client.ws.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.ws.terminate();
      resolve();
    }, 2000);
    client.ws.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    client.ws.close(1000, 'Smoke concluído');
  });
}
async function connect(index, token) {
  const c = {
    ws: new WebSocket(origin.replace('https:', 'wss:') + '/ws', {
      origin,
      handshakeTimeout: 10000,
      followRedirects: false,
    }),
    welcome: null,
    poses: new Map(),
    snapshots: 0,
    pong: null,
    socketError: null,
  };
  clients.push(c);
  c.ws.on('error', () => {
    c.socketError = true;
  });
  c.ws.on('message', (data, binary) => {
    if (binary) {
      if (!c.welcome) return;
      // Decode somente IDs próprios; os dados dos demais são descartados.
      for (const own of clients)
        if (own.welcome) {
          const pose = decodeSelfPosition(data, own.welcome.id);
          if (pose) {
            c.poses.set(own.welcome.id, pose);
            c.snapshots++;
          }
        }
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.t === 'welcome') c.welcome = { id: msg.id, token: msg.token };
    if (msg.t === 'pong') c.pong = { at: msg.at, received: performance.now() };
  });
  await new Promise((resolve, reject) => {
    c.ws.once('open', resolve);
    c.ws.once('error', () => reject(new Error('Falha no handshake válido.')));
  });
  c.ws.send(
    JSON.stringify({
      t: 'join',
      nick: `Smoke produção ${index}`,
      team: 0,
      character: 0,
      ...(token ? { token } : {}),
    }),
  );
  await until(() => c.welcome, 'welcome');
  return c;
}
async function until(predicate, name, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(30);
  }
  throw new Error(`Tempo excedido: ${name}`);
}
async function invalidOriginRejected() {
  return new Promise((resolve) => {
    const ws = new WebSocket(origin.replace('https:', 'wss:') + '/ws', {
      origin: 'https://origem-invalida.example',
      handshakeTimeout: 10000,
      followRedirects: false,
    });
    const timer = setTimeout(() => {
      ws.terminate();
      resolve(false);
    }, 12000);
    ws.once('open', () => {
      clearTimeout(timer);
      ws.terminate();
      resolve(false);
    });
    ws.once('error', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}
try {
  const health = await fetchCheck('/health');
  const status = JSON.parse(health.text);
  assert.equal(status.storage, 'postgresql');
  assert.equal(status.local, false);
  report.checks.health = {
    ...health.result,
    ok: status.ok,
    storage: status.storage,
    playersBefore: status.players,
  };
  const me = await fetchCheck('/api/me');
  const account = JSON.parse(me.text);
  report.checks.anonymousAccount = { ...me.result, authenticated: !!account.user };
  const discovery = await fetchCheck('/servidores');
  const servers = JSON.parse(discovery.text);
  assert.ok(servers.servers.some((s) => s.ws === 'wss://manifestacoes.com/ws'));
  report.checks.discovery = {
    ...discovery.result,
    secureWebSocket: true,
    capacity: servers.servers[0].capacity,
  };
  const html = await fetchCheck('/');
  assert.ok(/Brasília|Brasilia/i.test(html.text));
  report.checks.html = html.result;
  const entry = html.text.match(/<script\b[^>]*\bsrc=["'](\/client\.js\?v=([a-f0-9]{12}))["']/i);
  assert.ok(entry, 'HTML deve referenciar /client.js?v=SHA256 de 12 caracteres');
  const clientBody = await fetchCheck(entry[1]);
  const actualHash = createHash('sha256').update(clientBody.body).digest('hex').slice(0, 12);
  assert.equal(
    actualHash,
    entry[2],
    'Versão do entry deve corresponder ao SHA256 do corpo servido',
  );
  report.checks.versionedClient = {
    ...clientBody.result,
    version: entry[2],
    sha256PrefixMatches: true,
  };
  report.checks.client = (await fetchCheck('/client.js', 'HEAD')).result;
  report.checks.asset = (await fetchCheck('/assets/index-BpfooI69.js', 'HEAD')).result;
  report.checks.invalidOriginRejected = await invalidOriginRejected();
  assert.equal(report.checks.invalidOriginRejected, true);
  const a = await connect(1),
    b = await connect(2);
  assert.notEqual(a.welcome.id, b.welcome.id);
  await until(
    () => a.poses.has(a.welcome.id) && a.poses.has(b.welcome.id) && b.poses.has(a.welcome.id),
    'snapshots compartilhados',
  );
  const start = a.poses.get(a.welcome.id);
  for (let seq = 1; seq <= 12; seq++) {
    a.ws.send(JSON.stringify({ t: 'input', x: 0, z: 1, seq, run: false }));
    await sleep(100);
  }
  a.ws.send(JSON.stringify({ t: 'input', x: 0, z: 0, seq: 13, run: false }));
  await sleep(250);
  const end = b.poses.get(a.welcome.id);
  const distance = Math.hypot(end.x - start.x, end.z - start.z);
  assert.ok(distance >= 0.1, 'Movimento recebido pelo segundo cliente');
  const pingAt = Date.now(),
    pingStart = performance.now();
  a.ws.send(JSON.stringify({ t: 'ping', at: pingAt }));
  await until(() => a.pong?.at === pingAt, 'pong');
  report.checks.multiplayer = {
    ownClients: 2,
    snapshots: a.snapshots + b.snapshots,
    movementReceivedByPeer: true,
    distance: Math.round(distance * 100) / 100,
    pingMs: Math.round(a.pong.received - pingStart),
  };
  const previous = a.welcome;
  await close(a);
  const resumed = await connect(1, previous.token);
  assert.equal(resumed.welcome.id, previous.id);
  assert.equal(resumed.welcome.token, previous.token);
  report.checks.reconnect = { restoredOwnIdentity: true };
} catch (error) {
  report.errors.push(error.message);
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map(close));
  try {
    const after = await fetchCheck('/health');
    report.checks.healthAfter = { ...after.result, playersAfter: JSON.parse(after.text).players };
  } catch {
    report.errors.push('Health final indisponível.');
    process.exitCode = 1;
  }
  report.ok = report.errors.length === 0;
  await fs.mkdir(path.join(root, 'analysis/production'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'analysis/production/smoke.json'),
    JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
}
