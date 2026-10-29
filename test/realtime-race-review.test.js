import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { attachRealtime } from '../src/realtime.js';
import { RACE_GATES, tickRace } from '../src/race.js';

const receive = (ws, type) =>
  new Promise((resolve) => {
    function listener(data, binary) {
      if (binary) return;
      const message = JSON.parse(data.toString());
      if (message.t !== type) return;
      ws.off('message', listener);
      resolve(message);
    }
    ws.on('message', listener);
  });

for (const phase of ['countdown', 'racing']) {
  test(
    `unstuck encerra participação durante ${phase} sem cruzar checkpoints`,
    { timeout: 3000 },
    async (t) => {
      const server = createServer();
      const ctx = {
        freeAccess: true,
        state: { users: [], sessions: {}, world: {}, designs: [], media: [] },
        save() {},
        dataDir: '/tmp',
      };
      const realtime = attachRealtime(server, ctx);
      server.on('upgrade', (req, socket, head) =>
        realtime.wss.handleUpgrade(req, socket, head, (ws) =>
          realtime.wss.emit('connection', ws, req),
        ),
      );
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      t.after(async () => {
        await realtime.close();
        await new Promise((resolve) => server.close(resolve));
      });
      const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
      await once(ws, 'open');
      const welcome = receive(ws, 'welcome');
      ws.send(JSON.stringify({ t: 'join', nick: 'Piloto' }));
      const player = ctx.players.get((await welcome).id);
      const checkpoint = RACE_GATES.findIndex((gate) => Math.abs(gate.x) < 120 && gate.z > 50);
      assert.ok(checkpoint >= 0);
      const gate = RACE_GATES[checkpoint];
      Object.assign(player, {
        x: gate.x * 2,
        z: gate.z * 2,
        mode: 1,
        race: true,
        raceFrozen: phase === 'countdown',
      });
      const row = {
        id: player.id,
        entryId: `guest:${player.id}`,
        status: phase === 'racing' ? 'racing' : 'queued',
        checkpoint,
        lastX: player.x,
        lastZ: player.z,
        points: 0,
      };
      Object.assign(ctx.race, {
        phase,
        until: Date.now() + 60000,
        startedAt: Date.now(),
        rows: [row],
      });
      const relocated = receive(ws, 'relocate');
      ws.send(JSON.stringify({ t: 'unstuck' }));
      const message = await relocated;
      assert.equal(message.x, 0);
      assert.equal(message.z, 0);
      assert.equal(row.status, 'dnf');
      assert.equal(player.race, false);
      assert.equal(player.raceFrozen, false);
      tickRace(ctx);
      assert.equal(row.checkpoint, checkpoint);
      assert.equal(row.points, 0);
    },
  );
}
