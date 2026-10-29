import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRocket,
  handleRoadsterMessage,
  tickRoadster,
  roadsterVehicle,
} from '../src/roadster.js';
import { canOccupyPlayer } from '../src/simulation.js';
import { encodeNear, HEADER_BYTES } from '../src/protocol.js';
const player = () => ({
  id: 1,
  vehicle: 100001,
  mode: 12,
  x: -8,
  z: 28,
  yaw: 0,
  speed: 0,
  input: { x: 0, z: 1, run: false },
});
function tick(p, seconds, from = 1000) {
  for (let i = 1; i <= seconds * 120; i++)
    tickRoadster(p, p.input, 1 / 120, {}, from + (i * 1000) / 120);
}
test('comandos só afetam um Roadster ativo', () => {
  const p = player();
  p.mode = 0;
  assert.equal(handleRoadsterMessage(p, { t: 'roadster', a: 'jump' }, {}, 1000), true);
  assert.equal(p.rocket, undefined);
  assert.equal(handleRoadsterMessage(p, { t: 'chat' }, {}, 1000), false);
});
test('boost aumenta velocidade e respeita cooldown', () => {
  const p = player();
  handleRoadsterMessage(p, { t: 'roadster', a: 'boost' }, {}, 1000);
  tick(p, 1);
  assert.ok(p.speed > 27 && p.speed <= 43);
  assert.equal(p.rocket.boostReady, 11000);
  handleRoadsterMessage(p, { t: 'roadster', a: 'boost' }, {}, 2000);
  assert.equal(p.rocket.boostReady, 11000);
});
test('salto, rolagem e pouso produzem estado serializável ao cliente', () => {
  const p = player();
  handleRoadsterMessage(p, { t: 'roadster', a: 'jump' }, {}, 1000);
  handleRoadsterMessage(p, { t: 'roadster', a: 'roll', roll: 1 }, {}, 1000);
  tick(p, 0.3);
  assert.ok(p.rocket.alt > 1);
  assert.ok(p.rocket.roll > 0);
  assert.equal(p.rocket.jets & 4, 4);
  const v = roadsterVehicle(p);
  assert.equal(v.kind, 12);
  assert.ok(Number.isFinite(v.rocket.pitch));
  assert.equal(v.rocket.x, p.x);
  tick(p, 5, 1300);
  assert.equal(p.rocket.alt, 0);
  assert.equal(p.rocket.roll, 0);
  assert.equal(p.rocket.vy, 0);
});
test('salto é impedido na zona de paz e trocar veículo reinicia foguete', () => {
  const p = player();
  p.x = 0;
  p.z = 0;
  handleRoadsterMessage(p, { t: 'roadster', a: 'jump' }, {}, 1000);
  assert.equal(p.rocket.alt, 0);
  handleRoadsterMessage(p, { t: 'roadster', a: 'boost' }, {}, 1000);
  p.vehicle++;
  tickRoadster(p, {}, 1 / 60, {}, 1100);
  assert.equal(p.rocket.boostUntil, 0);
});

test('sair do Roadster remove a altura do salto antes de simular o dirigível', () => {
  const p = player();
  handleRoadsterMessage(p, { t: 'roadster', a: 'jump' }, {}, 1000);
  tick(p, 0.3);
  assert.ok(p.alt > 0);
  p.mode = 4;
  p.vehicle++;
  assert.equal(tickRoadster(p, {}, 1 / 60, {}, 1400), false);
  assert.equal(p.alt, undefined);
  assert.equal(p.rocket, undefined);
  assert.equal(p.rocketVehicle, undefined);
  assert.equal(encodeNear([p], 1).readUInt8(HEADER_BYTES + 13), 27 * 4);
  p.alt = 30;
  tickRoadster(p, {}, 1 / 60, {}, 1500);
  assert.equal(p.alt, 30, 'preserva altura própria de outro veículo');
});

test('pouso bloqueado restaura a última pose livre e para o Roadster', () => {
  const p = { ...player(), x: 0, z: 95, yaw: Math.PI / 2, speed: 0 };
  const ctx = { colliders: [{ x: 0, z: 100, w: 5, d: 5 }] };
  assert.equal(canOccupyPlayer(p, ctx), true);
  p.rocket = createRocket(p);
  p.rocketVehicle = p.vehicle;
  p.rocket.alt = 0.01;
  p.rocket.vy = -1;
  p.x = 0;
  p.z = 100;
  p.yaw = 0;
  p.speed = 5;
  tickRoadster(p, {}, 1 / 60, ctx, 1000);
  assert.equal(p.alt, 0);
  assert.equal(p.x, 0);
  assert.equal(p.z, 95);
  assert.equal(p.yaw, Math.PI / 2);
  assert.equal(p.speed, 0);
  assert.equal(canOccupyPlayer(p, ctx), true);
  assert.equal(p.rocket.x, p.x);
  assert.equal(p.rocket.z, p.z);
});

test('pouso livre preserva o deslocamento aéreo', () => {
  const p = { ...player(), x: 0, z: 95 };
  p.rocket = createRocket(p);
  p.rocketVehicle = p.vehicle;
  p.rocket.alt = 0.01;
  p.rocket.vy = -1;
  p.z = 100;
  tickRoadster(p, {}, 1 / 60, {}, 1000);
  assert.equal(p.alt, 0);
  assert.equal(p.z, 100);
  assert.equal(canOccupyPlayer(p), true);
});

test('pouso escolhe spawn livre para o veículo quando a pose salva também está bloqueada', () => {
  const p = { ...player(), x: 0, z: 95 };
  p.rocket = createRocket(p);
  p.rocketVehicle = p.vehicle;
  p.rocket.alt = 0.01;
  p.rocket.vy = -1;
  p.z = 100;
  const ctx = {
    colliders: [
      { x: 0, z: 97.5, w: 5, d: 10 },
      { x: -8, z: 28, w: 1, d: 1 },
    ],
  };
  assert.equal(canOccupyPlayer({ ...p, z: 95 }, ctx), false);
  tickRoadster(p, {}, 1 / 60, ctx, 1000);
  assert.equal(p.alt, 0);
  assert.equal(p.speed, 0);
  assert.equal(canOccupyPlayer(p, ctx), true);
  assert.equal(p.rocket.x, p.x);
  assert.equal(p.rocket.z, p.z);
});

test('pouso aguarda liberação quando todos os destinos de retomada estão bloqueados', () => {
  const p = { ...player(), x: 0, z: 100 };
  p.rocket = createRocket(p);
  p.rocketVehicle = p.vehicle;
  p.rocket.alt = 0.01;
  p.rocket.vy = -1;
  const ctx = { colliders: [{ x: 0, z: 0, w: 1000, d: 3000 }] };
  tickRoadster(p, {}, 1 / 60, ctx, 1000);
  assert.ok(p.alt > 0);
  assert.equal(p.speed, 0);
  tickRoadster(p, {}, 0.1, {}, 1100);
  assert.equal(p.alt, 0);
  assert.equal(canOccupyPlayer(p), true);
});
