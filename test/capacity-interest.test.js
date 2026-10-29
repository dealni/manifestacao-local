import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterestIndex, MAX_NEAR_ACTORS } from '../src/interest.js';
import { createLocalServer } from '../src/server.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const actors = () => Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, x: 0, z: 0 }));
test('1000 pessoas agrupadas mantêm a própria posição e no máximo64 detalhes', () => {
  const all = actors(),
    index = createInterestIndex(all);
  for (const viewer of all) {
    const near = index.near(viewer);
    assert.equal(near[0], viewer);
    assert.equal(near.length, MAX_NEAR_ACTORS);
    assert.equal(new Set(near.map((p) => p.id)).size, near.length);
  }
});
test('índice espacial separa regiões, descarta espectadores e reconstrói posições', () => {
  const a = { id: 1, x: -250, z: -630 },
    b = { id: 2, x: 250, z: 630 },
    spectator = { id: 3, x: -250, z: -630, spectator: true };
  const index = createInterestIndex([a, b, spectator]);
  assert.deepEqual(index.near(a), [a]);
  assert.deepEqual(index.near(spectator), [spectator, a]);
  b.x = a.x;
  b.z = a.z;
  assert.deepEqual(createInterestIndex([a, b]).near(a), [a, b]);
});
test('tick agrupa snapshots persistidos, mas gravações fora do lote continuam imediatas', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifestacao-batch-test-'));
  const app = await createLocalServer({ dataDir: dir, port: 0 });
  t.after(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const original = app.ctx.persistence.save.bind(app.ctx.persistence);
  let writes = 0;
  app.ctx.persistence.save = (...args) => {
    writes++;
    return original(...args);
  };
  app.ctx.beginSaveBatch();
  app.ctx.beginSaveBatch();
  app.ctx.state.fixture = 1;
  app.ctx.save();
  app.ctx.save();
  assert.equal(writes, 0);
  app.ctx.endSaveBatch();
  assert.equal(writes, 0);
  app.ctx.endSaveBatch();
  assert.equal(writes, 1);
  await app.ctx.persistence.flush();
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8')).fixture, 1);
  app.ctx.state.fixture = 2;
  app.ctx.save();
  assert.equal(writes, 2);
  await app.ctx.persistence.flush();
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8')).fixture, 2);
});
test('sala grande usa proximidade, visão geral completa e atualização incremental de aparência', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifestacao-near-test-'));
  const app = await createLocalServer({
    dataDir: dir,
    port: 0,
    maxPlayers: 1000,
  });
  const address = await app.listen();
  const clients = [];
  t.after(async () => {
    for (const c of clients) c.ws.terminate();
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  for (let i = 0; i < 130; i += 10)
    await Promise.all(
      Array.from(
        { length: 10 },
        () =>
          new Promise((resolve, reject) => {
            const c = {
              ws: new WebSocket(`ws://127.0.0.1:${address.port}/ws`),
              messages: [],
              near: null,
              overview: 0,
            };
            clients.push(c);
            const timer = setTimeout(() => reject(Error('Welcome não recebido')), 5000);
            c.ws.on('error', reject);
            c.ws.on('open', () => c.ws.send(JSON.stringify({ t: 'join', character: 0 })));
            c.ws.on('message', (data, binary) => {
              if (binary) {
                if (data[0] === 1) c.near = data;
                if (data[0] === 2) c.overview = data.readUInt16LE(5);
                return;
              }
              const m = JSON.parse(data);
              c.messages.push(m);
              if (m.t === 'welcome') {
                c.id = m.id;
                clearTimeout(timer);
                resolve();
              }
            });
          }),
      ),
    );
  const wait = async (predicate) => {
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error('Atualização não recebida');
  };
  await wait(() => clients.every((c) => c.overview === 130 && c.near?.readUInt16LE(5) <= 64));
  for (const c of clients) {
    assert.equal(c.near.readUInt32LE(7), c.id);
    assert.equal(c.near.readUInt32LE(11), c.id);
    c.messages.length = 0;
  }
  const last = clients.at(-1);
  last.ws.send(JSON.stringify({ t: 'style', shirt: 9 }));
  await wait(() =>
    clients[0].messages.some(
      (m) => m.t === 'names' && m.people.some((p) => p.id === last.id && p.look[1] === 9),
    ),
  );
  const update = clients[0].messages.find(
    (m) => m.t === 'names' && m.people.some((p) => p.id === last.id && p.look[1] === 9),
  );
  assert.equal(update.people.length, 1);
  assert.equal(app.realtime.metrics().storageStopped, false);
});

test('progresso é coalescido e o encerramento confirma alterações ainda pendentes', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifestacao-progress-test-'));
  const app = await createLocalServer({ dataDir: dir, port: 0 });
  t.after(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const original = app.ctx.persistence.save.bind(app.ctx.persistence);
  let writes = 0;
  app.ctx.persistence.save = (...args) => {
    writes++;
    return original(...args);
  };
  app.ctx.state.fixture = 1;
  for (let i = 0; i < 1000; i++) app.ctx.saveProgress();
  assert.equal(writes, 0);
  await new Promise((r) => setTimeout(r, 600));
  await app.ctx.persistence.flush();
  assert.equal(writes, 1);
  app.ctx.state.fixture = 2;
  app.ctx.saveProgress();
  app.ctx.save();
  assert.equal(writes, 2);
  app.ctx.state.fixture = 3;
  app.ctx.saveProgress();
  await app.close();
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8')).fixture, 3);
});

test('prioriza vizinhos reais em extremos da mesma célula e no pacote binário', () => {
  const a = { id: 1001, x: 0.1, z: 0.1 };
  const b = { id: 1002, x: 0.6, z: 0.6 };
  const center = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, x: 40, z: 40 }));
  const index = createInterestIndex([a, b, ...center]);
  // A ordem de consulta não deve contaminar observadores da mesma célula.
  index.near(center[0]);
  assert.equal(index.near(a)[1], b);
  assert.equal(index.near(b)[1], a);
  const packet = index.packet(a, 1, { seq: 0, held: 0 });
  const ids = Array.from({ length: packet.readUInt16LE(5) }, (_, i) =>
    packet.readUInt32LE(11 + i * 16),
  );
  assert.ok(ids.includes(b.id));
  assert.equal(new Set(ids).size, MAX_NEAR_ACTORS);
});

test('seleção limitada equivale aos vizinhos mais próximos em multidão dispersa', () => {
  const all = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    x: ((i * 37) % 1000) * 0.079,
    z: ((i * 71) % 1000) * 0.079,
  }));
  const index = createInterestIndex(all);
  for (const viewer of all.filter((_, i) => i % 97 === 0)) {
    const distance = (p) => (p.x - viewer.x) ** 2 + (p.z - viewer.z) ** 2;
    const expected = all
      .filter((p) => p !== viewer)
      .sort((a, b) => distance(a) - distance(b) || a.id - b.id)
      .slice(0, MAX_NEAR_ACTORS - 1);
    assert.deepEqual(index.near(viewer), [viewer, ...expected]);
  }
});
