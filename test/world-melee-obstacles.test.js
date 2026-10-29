import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWorldMessage, initWorld } from '../src/world-actions.js';
import { canOccupy } from '../src/simulation.js';

function setup() {
  const attacker = {
    id: 1,
    userId: 'attacker',
    x: -216,
    z: -407.5,
    yaw: Math.PI,
    team: 0,
    mode: 0,
    pvp: { on: true, weapon: 'push' },
  };
  const target = {
    ...attacker,
    id: 2,
    userId: 'target',
    z: -410.5,
    team: 1,
  };
  const broadcasts = [];
  const ctx = {
    freeAccess: true,
    state: { users: [{ id: 'attacker' }, { id: 'target' }] },
    players: new Map([
      [1, attacker],
      [2, target],
    ]),
    save() {},
    broadcast(message) {
      broadcasts.push(message);
    },
  };
  initWorld(attacker, ctx);
  initWorld(target, ctx);
  return { attacker, target, ctx, broadcasts };
}

test('golpe corpo a corpo não atravessa o portão fechado nem concede missão', () => {
  const f = setup();
  assert.equal(canOccupy(f.attacker.x, f.attacker.z, 0.4, f.ctx), true);
  assert.equal(canOccupy(f.target.x, f.target.z, 0.4, f.ctx), true);
  assert.equal(canOccupy(-216, -409, 0.08, f.ctx), false);
  handleWorldMessage(f.attacker, { t: 'attack' }, f.ctx);
  assert.deepEqual(
    f.broadcasts.at(-1).actions.map((action) => action.kind),
    ['attack'],
  );
  assert.equal(f.ctx.state.world.progress.attacker.mission.counts.meleeHits, undefined);
});

test('golpe corpo a corpo continua atingindo o alvo quando o portão abre', () => {
  const f = setup();
  const now = Date.now();
  f.ctx.state.world.secret.gate = { openedAt: now - 1000, until: now + 10000 };
  assert.equal(canOccupy(-216, -409, 0.08, f.ctx), true);
  handleWorldMessage(f.attacker, { t: 'attack' }, f.ctx);
  assert.deepEqual(
    f.broadcasts.at(-1).actions.map((action) => action.kind),
    ['attack', 'hit'],
  );
  assert.equal(f.ctx.state.world.progress.attacker.mission.counts.meleeHits, 1);
});
