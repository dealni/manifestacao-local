import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stepPlayer,
  spawnForTeam,
  constants,
  canOccupy,
  STATIC_COLLIDER_COUNT,
} from '../src/simulation.js';
const close = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
function advance(player, input, seconds = 1) {
  for (let i = 0; i < seconds * 60; i++) stepPlayer(player, input, 1 / 60);
  return player;
}
test('spawns dos três times estão livres nos sólidos públicos extraídos', () => {
  assert.ok(STATIC_COLLIDER_COUNT > 3000);
  for (const team of [0, 1, 2]) {
    const p = spawnForTeam(team);
    assert.ok(canOccupy(p.x, p.z));
    assert.ok(Number.isFinite(p.yaw));
  }
});
test('velocidades de caminhada e corrida correspondem à predição original', () => {
  for (const [run, speed] of [
    [false, 1.7],
    [true, 4.6],
  ]) {
    const p = spawnForTeam(0),
      z = p.z;
    advance(p, { x: 0, z: 1, run });
    close(p.z - z, speed);
    close(p.speed, speed);
  }
});
test('movimento diagonal não excede velocidade da caminhada', () => {
  const p = spawnForTeam(0),
    origin = { ...p };
  advance(p, { x: 1, z: 1 });
  close(Math.hypot(p.x - origin.x, p.z - origin.z), constants.WALK_SPEED);
});
test('o movimento não atravessa uma parede e desliza pelo eixo livre', () => {
  const p = spawnForTeam(0),
    x = p.x,
    z = p.z;
  const ctx = { colliders: [{ x: x + 1, z, w: 0.2, d: 12 }] };
  for (let i = 0; i < 60; i++) stepPlayer(p, { x: 1, z: 1, run: true }, 1 / 60, ctx);
  assert.ok(p.x < x + 0.51);
  assert.ok(p.z > z + 2);
});
test('dt e entrada malformada não produzem NaN nem salto temporal', () => {
  const p = spawnForTeam(0);
  stepPlayer(p, { x: NaN, z: Infinity }, Infinity);
  assert.ok(Number.isFinite(p.x));
  const z = p.z;
  stepPlayer(p, { x: 0, z: 1 }, 99);
  close(p.z - z, 1.7 * 0.25);
});
test('caminhada respeita os limites do mapa', () => {
  const p = { x: 0, z: 639.55, yaw: 0, speed: 0, mode: 0 };
  advance(p, { z: 1, run: true });
  assert.ok(p.z <= 639.6 + 1e-8);
});
test('carro reproduz a aceleração exponencial e esterço em segundos', () => {
  const p = { ...spawnForTeam(0), vehicle: 100001, mode: 1 };
  advance(p, { z: 1 });
  close(p.speed, 16 * (1 - Math.exp(-2.6)));
  const yaw = p.yaw;
  stepPlayer(p, { x: 1, z: 1 }, 1 / 60);
  assert.ok(p.yaw < yaw);
});
test('freio reverte a marcha gradualmente e carreta limita articulação', () => {
  const p = { ...spawnForTeam(0), vehicle: 100001, mode: 3, trailer: 0 };
  advance(p, { z: 1 });
  const speed = p.speed;
  stepPlayer(p, { z: -1 }, 1 / 60);
  assert.ok(p.speed < speed);
  for (let i = 0; i < 240; i++) stepPlayer(p, { z: 1, x: 1 }, 1 / 60);
  const diff = Math.atan2(Math.sin(p.yaw - p.trailer), Math.cos(p.yaw - p.trailer));
  assert.ok(Math.abs(diff) <= 1.25 + 1e-8);
});
