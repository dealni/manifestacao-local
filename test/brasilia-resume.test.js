import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { attachRealtime } from '../src/realtime.js';
import { canOccupy, spawnForTeam, stepPlayer } from '../src/simulation.js';

async function fixture(t) {
  const server = createServer();
  const ctx = {
    state: {
      users: [{ id: 'owned-roadster', owned: { veiculos: ['tesla-roadster'] } }],
      sessions: { ['b'.repeat(64)]: { userId: 'owned-roadster', expiresAt: Date.now() + 60000 } },
      world: {},
      designs: [],
      media: [],
    },
    save() {},
    user() {
      return null;
    },
    dataDir: '/tmp',
  };
  const rt = attachRealtime(server, ctx);
  server.on('upgrade', (req, socket, head) =>
    rt.wss.handleUpgrade(req, socket, head, (ws) => rt.wss.emit('connection', ws, req)),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await rt.close();
    await new Promise((resolve) => server.close(resolve));
  });
  async function join(options = {}) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`, {
      headers: { cookie: `local_session=${'b'.repeat(64)}` },
    });
    const welcome = new Promise((resolve, reject) => {
      ws.on('error', reject);
      ws.on('message', (data, binary) => {
        if (!binary) {
          const message = JSON.parse(data);
          if (message.t === 'welcome') resolve(message);
        }
      });
    });
    await new Promise((resolve) => ws.once('open', resolve));
    ws.send(JSON.stringify({ t: 'join', nick: 'Teste temporário', team: 0, ...options }));
    const message = await welcome;
    return { ws, welcome: message, player: ctx.players.get(message.id) };
  }
  return { ctx, join };
}

test(
  'retomada dentro da Torre de TV usa spawn livre e permite caminhar',
  { timeout: 3000 },
  async (t) => {
    const { join } = await fixture(t);
    const { player } = await join({ team: 2, resume: { x: 85, z: -532, yaw: 1, mode: 0 } });
    const spawn = spawnForTeam(2);
    assert.equal(player.x, spawn.x);
    assert.equal(player.z, spawn.z);
    assert.ok(canOccupy(player.x, player.z));
    assert.equal(player.speed, 0);
    const x = player.x;
    stepPlayer(player, { x: 1, run: true }, 0.25);
    assert.ok(player.x > x);
  },
);

test('retomada livre conserva posição e orientação', { timeout: 3000 }, async (t) => {
  const { join } = await fixture(t);
  const { player } = await join({ resume: { x: 0, z: 100, yaw: 1.2, mode: 0 } });
  assert.equal(player.x, 0);
  assert.equal(player.z, 100);
  assert.equal(player.yaw, 1.2);
});

test(
  'token retido em sólido novo mantém identidade e realoca o veículo sem pose antiga do Roadster',
  { timeout: 3000 },
  async (t) => {
    const { join } = await fixture(t);
    const a = await join({ resume: { x: 0, z: 100, yaw: 0, mode: 12 } });
    const vehicle = a.player.vehicle;
    Object.assign(a.player, { x: 85, z: -532, speed: 20, trailer: 1 });
    a.player.rocket = { ...a.player.rocket, x: 85, z: -532, speed: 20, alt: 5 };
    a.player.rocketVehicle = vehicle;
    const closed = new Promise((resolve) => a.ws.once('close', resolve));
    a.ws.close();
    await closed;
    const b = await join({ token: a.welcome.token });
    assert.equal(b.welcome.id, a.welcome.id);
    assert.equal(b.welcome.token, a.welcome.token);
    assert.equal(b.player.vehicle, vehicle);
    assert.equal(b.player.mode, 12);
    assert.equal(b.player.x, spawnForTeam(0).x);
    assert.equal(b.player.z, spawnForTeam(0).z);
    assert.equal(b.player.speed, 0);
    assert.equal(b.player.trailer, undefined);
    assert.equal(b.player.rocket.x, b.player.x);
    assert.equal(b.player.rocket.z, b.player.z);
    assert.equal(b.player.rocket.alt, 0);
    assert.equal(b.player.rocket.speed, 0);
  },
);

test(
  'veículo considera sua extensão e não apenas o centro ao retomar',
  { timeout: 3000 },
  async (t) => {
    const { join } = await fixture(t);
    assert.ok(canOccupy(85, -539.5));
    const { player } = await join({ resume: { x: 85, z: -539.5, yaw: 0, mode: 12 } });
    assert.equal(player.x, spawnForTeam(0).x);
    assert.equal(player.z, spawnForTeam(0).z);
    assert.equal(player.mode, 12);
    assert.ok(player.vehicle);
  },
);

test(
  'reconexão de veículo livre junto ao marco preserva identidade, veículo e fila',
  { timeout: 3000 },
  async (t) => {
    const { ctx, join } = await fixture(t);
    const a = await join({ resume: { x: 77.9, z: -532, yaw: 0, mode: 1 } });
    assert.equal(a.player.x, 77.9);
    const vehicle = a.player.vehicle;
    ctx.race.rows.push({ id: a.player.id, status: 'queued', checkpoint: 0 });
    const closed = new Promise((resolve) => a.ws.once('close', resolve));
    a.ws.close();
    await closed;
    const b = await join({ token: a.welcome.token, resume: { x: 85, z: -532, mode: 0 } });
    assert.equal(b.welcome.id, a.welcome.id);
    assert.equal(b.welcome.token, a.welcome.token);
    assert.equal(b.player.x, 77.9);
    assert.equal(b.player.z, -532);
    assert.equal(b.player.mode, 1);
    assert.equal(b.player.vehicle, vehicle);
    assert.equal(ctx.race.rows[0].id, b.player.id);
    assert.equal(ctx.race.rows[0].status, 'queued');
  },
);
