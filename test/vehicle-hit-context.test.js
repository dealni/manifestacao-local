import test from 'node:test';
import assert from 'node:assert/strict';
import { detectVehicleHits } from '../src/vehicle-hits.js';

function fixture() {
  const driver = {
    id: 1,
    x: -216,
    z: -406.4,
    yaw: Math.PI,
    mode: 1,
    vehicle: 100001,
    team: 0,
    pvp: { on: true, weapon: 'push' },
  };
  const target = {
    id: 2,
    x: -216,
    z: -409,
    yaw: 0,
    mode: 0,
    vehicle: 0,
    team: 1,
    pvp: { on: true, weapon: 'push' },
  };
  const at = Date.now();
  const ctx = {
    freeAccess: true,
    state: { world: { secret: { gate: { openedAt: at - 1000, until: at + 10000 } } } },
    players: new Map([
      [1, driver],
      [2, target],
    ]),
  };
  return { driver, target, ctx, at };
}

function cross(f) {
  detectVehicleHits(f.target, f.ctx, f.at);
  detectVehicleHits(f.driver, f.ctx, f.at);
  f.driver.z += Math.cos(f.driver.yaw) * 0.8;
  return detectVehicleHits(f.driver, f.ctx, f.at + 50);
}

test('trajetória de atropelamento considera o portão realmente aberto no mundo', () => {
  const f = fixture();
  assert.equal(cross(f).length, 1);
});

test('trajetória de atropelamento continua bloqueada pelo portão fechado', () => {
  const f = fixture();
  f.ctx.state.world.secret.gate = { openedAt: 0, until: 0 };
  assert.deepEqual(cross(f), []);
});

test('trajetória de atropelamento considera bloqueios dinâmicos do contexto', () => {
  const f = fixture();
  Object.assign(f.driver, { x: 0, z: 100, yaw: 0 });
  Object.assign(f.target, { x: 0, z: 102.6 });
  f.ctx.colliders = [{ x: 0, z: 102.4, w: 3, d: 0.1 }];
  assert.deepEqual(cross(f), []);
});
