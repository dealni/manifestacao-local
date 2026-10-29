import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { attachRealtime } from '../src/realtime.js';

async function fixture(t) {
  const server = createServer();
  const ctx = {
    freeAccess: true,
    state: { users: [], sessions: {}, world: {}, designs: [], media: [] },
    save() {},
    dataDir: '/tmp',
  };
  const realtime = attachRealtime(server, ctx);
  server.on('upgrade', (req, socket, head) =>
    realtime.wss.handleUpgrade(req, socket, head, (ws) => realtime.wss.emit('connection', ws, req)),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await realtime.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  const messages = [];
  ws.on('message', (data, binary) =>
    messages.push(binary ? Buffer.from(data) : JSON.parse(data.toString())),
  );
  await once(ws, 'open');
  const send = (msg) => ws.send(JSON.stringify(msg));
  async function wait(predicate) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const found = messages.find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.fail('Mensagem esperada não chegou');
  }
  send({ t: 'join', nick: 'Piloto' });
  const welcome = await wait((m) => m.t === 'welcome');
  const player = ctx.players.get(welcome.id);
  send({ t: 'vehicle', kind: 12 });
  await wait((m) => m.t === 'stats' && m.vehicles.some((v) => v.kind === 12));
  // Representa um salto em andamento sem depender do relógio ou de controles contínuos.
  Object.assign(player, {
    alt: 9,
    rocket: { alt: 9 },
    rocketVehicle: player.vehicle,
    inputAt: Date.now() - 1000,
  });
  messages.length = 0;
  return { player, send, wait };
}

test('trocar Roadster por dirigível limpa voo antes do primeiro snapshot mesmo com input stale', async (t) => {
  const { player, send, wait } = await fixture(t);
  send({ t: 'vehicle', kind: 4 });
  const snapshot = await wait((m) => Buffer.isBuffer(m) && m[0] === 1 && m[23] === 4);
  assert.equal(snapshot[24], 27 * 4);
  assert.equal(player.alt, undefined);
  assert.equal(player.rocket, undefined);
  assert.equal(player.rocketVehicle, undefined);
});

test('entrar como espectador limpa estado de voo do Roadster imediatamente', async (t) => {
  const { player, send, wait } = await fixture(t);
  send({ t: 'spectate', on: true });
  await wait((m) => m.t === 'mode' && m.spectator === true);
  assert.equal(player.mode, 0);
  assert.equal(player.alt, undefined);
  assert.equal(player.rocket, undefined);
  assert.equal(player.rocketVehicle, undefined);
});
