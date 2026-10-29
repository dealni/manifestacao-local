import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementValidator } from '../src/movement.js';
import { canOccupyPlayer } from '../src/simulation.js';

const player = () => ({ id: 1, x: 0, z: 100, yaw: 0, speed: 0, mode: 0, vehicle: 0 });
const pose = (p, x = p.x, z = p.z, extra = {}) => ({ x, z, yaw: p.yaw, speed: 1, ...extra });

test('burst não renova tolerância e velocidade depende do relógio do servidor', () => {
  const p = player(),
    validator = createMovementValidator();
  validator.start(p, null, 1000);
  assert.equal(validator.accept(p, pose(p, 0.1), {}, 1000), true);
  for (let i = 0; i < 100; i++) validator.accept(p, pose(p, p.x + 0.1), {}, 1000);
  assert.ok(p.x <= 0.200001);
  assert.equal(validator.accept(p, pose(p, p.x + 0.4), {}, 1100), true);
  assert.equal(validator.accept(p, pose(p, p.x + 5), {}, 1100), false);
  assert.equal(validator.accept(p, pose(p, p.x + 0.1, p.z, { speed: 500 }), {}, 1200), false);
});

test('simulação, troca de veículo e retomada não criam crédito adicional', () => {
  const p = player(),
    validator = createMovementValidator();
  validator.start(p, null, 1000);
  p.x += 0.6;
  validator.spend(p, 0.6, 1100);
  assert.equal(validator.accept(p, pose(p, p.x + 0.4), {}, 1100), false);
  p.mode = 1;
  p.vehicle = 1;
  assert.equal(validator.accept(p, pose(p, p.x + 5), {}, 1100), false);
  const resumed = { ...p };
  validator.start(resumed, p, 1100);
  assert.equal(validator.accept(resumed, pose(resumed, resumed.x + 5), {}, 1100), false);
  assert.equal(validator.accept(resumed, pose(resumed, resumed.x + 1), {}, 1200), true);
});

test('pose não atravessa parede mesmo com destino livre e crédito suficiente', () => {
  const p = player(),
    validator = createMovementValidator();
  p.z = 99;
  const ctx = { colliders: [{ x: 0, z: 100, w: 10, d: 0.1 }] };
  validator.start(p, null, 1000);
  assert.equal(canOccupyPlayer(p, ctx), true);
  assert.equal(canOccupyPlayer({ ...p, z: 101 }, ctx), true);
  assert.equal(validator.accept(p, pose(p, 0, 101), ctx, 1400), false);
  assert.equal(p.z, 99);
  assert.equal(validator.accept(p, pose(p, 0.3, 99), ctx, 1400), true);
});

test('pose malformada ou fora do mapa não é reinterpretada como posição válida', () => {
  const p = player(),
    validator = createMovementValidator();
  validator.start(p, null, 1000);
  for (const bad of [{ x: NaN }, { z: Infinity }, { x: 261 }, { yaw: '0' }, { speed: -999 }])
    assert.equal(validator.accept(p, pose(p, 0, 100, bad), {}, 2000), false);
  assert.equal(validator.accept(p, pose(p, 0.3), {}, 2000), true);
});
