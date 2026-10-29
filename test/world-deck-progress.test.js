import test from 'node:test';
import assert from 'node:assert/strict';
import { initWorld, handleWorldMessage, worldTick } from '../src/world-actions.js';

test('palco do caminhão não concede direção ou atividade pelo deslocamento do motorista', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 10000 });
  const messages = [];
  const player = { id: 1, userId: 'user', x: 0, z: -300, mode: 0, team: 0 };
  const ctx = {
    state: { users: [{ id: 'user', owned: {} }], world: {} },
    players: new Map([[1, player]]),
    save() {},
    sendPlayer(_player, message) {
      messages.push(message);
    },
  };
  initWorld(player, ctx);
  worldTick(player, ctx);
  for (const state of [{ mode: 32 }, { mode: 0, stageDeck: { owner: 2, truck: 10 } }]) {
    Object.assign(player, state);
    t.mock.timers.tick(1000);
    player.z += 10;
    worldTick(player, ctx);
    handleWorldMessage(player, { t: 'missions' }, ctx);
    assert.deepEqual(messages.at(-1).state.counts, {});
  }
  delete player.stageDeck;
  player.mode = 0;
  t.mock.timers.tick(1000);
  player.z += 1;
  worldTick(player, ctx);
  handleWorldMessage(player, { t: 'missions' }, ctx);
  assert.deepEqual(messages.at(-1).state.counts, { walk: 1, activeMs: 1000 });
});
