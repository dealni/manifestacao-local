import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { attachRealtime } from '../src/realtime.js';
import { initWorld, worldTick } from '../src/world-actions.js';

async function fixture(t) {
  const server = createServer();
  const ctx = {
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
  async function join(token) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
    await once(ws, 'open');
    const welcome = new Promise((resolve) => {
      ws.on('message', (data, binary) => {
        if (!binary) {
          const message = JSON.parse(data.toString());
          if (message.t === 'welcome') resolve(message);
        }
      });
    });
    ws.send(JSON.stringify({ t: 'join', token, nick: 'Visitante' }));
    return { ws, welcome: await welcome };
  }
  return { ctx, join };
}

test(
  'retomar conexão ativa encerra a mesa que referenciava a instância antiga',
  { timeout: 3000 },
  async (t) => {
    const { ctx, join } = await fixture(t);
    const first = await join();
    const player = ctx.players.get(first.welcome.id);
    Object.assign(player, { x: -40, z: -28 });
    const created = new Promise((resolve) => {
      first.ws.on('message', (data, binary) => {
        if (!binary) {
          const message = JSON.parse(data.toString());
          if (message.t === 'cm_state' && message.sessions.length) resolve();
        }
      });
    });
    first.ws.send(
      JSON.stringify({ t: 'cm', action: 'create', x: -40, z: -28, yaw: 0, topic: 'Retomada' }),
    );
    await created;
    assert.equal(ctx.debateSessions.size, 1);
    const resumed = await join(first.welcome.token);
    assert.equal(resumed.welcome.id, player.id);
    assert.notEqual(ctx.players.get(player.id), player);
    assert.equal(ctx.debateSessions.size, 0);
    assert.equal(ctx.players.size, 1);
  },
);

test(
  'retomar no palco do caminhão libera embarque antes de reconstruir o modo',
  { timeout: 3000 },
  async (t) => {
    const { ctx, join } = await fixture(t);
    const first = await join();
    const player = ctx.players.get(first.welcome.id);
    Object.assign(player, { mode: 32, stageDeck: { owner: 999, truck: 100000, x: 0, z: 0 } });
    const resumed = await join(first.welcome.token);
    const restored = ctx.players.get(resumed.welcome.id);
    assert.equal(player.stageDeck, undefined);
    assert.equal(restored.mode, 0);
    assert.equal(restored.vehicle, 0);
  },
);

test(
  'desconexão libera palco e retomada posterior permanece a pé',
  { timeout: 3000 },
  async (t) => {
    const { ctx, join } = await fixture(t);
    const first = await join();
    const player = ctx.players.get(first.welcome.id);
    Object.assign(player, { mode: 32, stageDeck: { owner: 999, truck: 100000, x: 0, z: 0 } });
    const disconnected = new Promise((resolve) => player.ws.once('close', resolve));
    first.ws.close();
    await disconnected;
    assert.equal(player.stageDeck, undefined);
    assert.equal(player.mode, 0);
    assert.equal(ctx.players.size, 0);
    const resumed = await join(first.welcome.token);
    assert.equal(ctx.players.get(resumed.welcome.id).mode, 0);
  },
);

for (const stale of [false, true, 'pose', 'pose-fora']) {
  test(
    `equipar dirigível fora do corredor não concede direção com input ${stale === 'pose-fora' ? 'com pose aceita fora do corredor' : stale === 'pose' ? 'com pose aceita' : stale ? 'antigo' : 'recente'}`,
    { timeout: 3000 },
    async (t) => {
      const { ctx, join } = await fixture(t);
      const first = await join();
      const player = ctx.players.get(first.welcome.id);
      ctx.freeAccess = true;
      player.user = { id: 'pilot', nick: 'Piloto' };
      ctx.state.users.push(player.user);
      initWorld(player, ctx);
      Object.assign(player, {
        x: stale === 'pose' ? 26.1 : 100,
        z: 100,
        inputAt: Date.now() - (stale ? 1000 : 0),
      });
      worldTick(player, ctx);
      const selected = new Promise((resolve) =>
        first.ws.on('message', (data, binary) => {
          if (!binary) {
            const message = JSON.parse(data.toString());
            if (message.t === 'stats' && message.vehicles.some((vehicle) => vehicle.kind === 4))
              resolve();
          }
        }),
      );
      first.ws.send(JSON.stringify({ t: 'vehicle', kind: 4 }));
      await selected;
      if (stale) {
        // Um tick do mundo pode estabelecer baseline antes de chegar input novo.
        worldTick(player, ctx);
        first.ws.send(
          JSON.stringify({
            t: 'input',
            x: 0,
            z: 0,
            ...(typeof stale === 'string'
              ? {
                  pose: {
                    x: stale === 'pose-fora' ? 100 : 26,
                    z: 100,
                    yaw: 0,
                    speed: 0,
                    epoch: player.trustEpoch ?? 0,
                    at: Date.now() >>> 0,
                  },
                }
              : {}),
          }),
        );
      }
      if (stale === 'pose-fora') {
        for (let attempt = 0; attempt < 100 && !player.lastPoseAt; attempt++)
          await new Promise((resolve) => setTimeout(resolve, 2));
        assert.ok(player.lastPoseAt > 0);
        assert.equal(player.x, 100);
        assert.equal(player.resetWorldOnVehicleStep, true);
        // A pose foi aceita, mas a projeção para o corredor ainda não ocorreu.
        worldTick(player, ctx);
        assert.equal(player.worldPrevious.x, 100);
      }
      for (let attempt = 0; attempt < 100 && player.x !== 26; attempt++)
        await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal(player.x, 26);
      if (stale === 'pose') assert.ok(player.lastPoseAt > 0);
      worldTick(player, ctx);
      assert.equal(ctx.state.world.progress.pilot.mission.counts.drive, undefined);
      if (stale === 'pose') {
        assert.equal(player.resetWorldOnVehicleStep, undefined);
        first.ws.send(
          JSON.stringify({
            t: 'input',
            x: 0,
            z: 0,
            seq: 77,
            pose: {
              x: 25.9,
              z: 100,
              yaw: 0,
              speed: 0,
              epoch: player.trustEpoch ?? 0,
              at: Date.now() >>> 0,
            },
          }),
        );
        for (let attempt = 0; attempt < 100 && player.inputSeq !== 77; attempt++)
          await new Promise((resolve) => setTimeout(resolve, 2));
        assert.equal(player.x, 25.9);
        worldTick(player, ctx);
        assert.ok(ctx.state.world.progress.pilot.mission.counts.drive > 0.09);
      }
    },
  );
}
