import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stepPlayer,
  spawnForTeam,
  canOccupyPlayer,
  VEHICLE_TUNING,
  constants,
} from '../src/simulation.js';

const modes = {
  1: 'carro',
  3: 'carreta',
  4: 'dirigível',
  5: 'carro de som',
  6: 'caminhão de som',
  7: 'moto',
  8: 'chopper',
  9: 'dinossauro',
  10: 'calango',
  11: 'onça',
  13: 'carrinho de pipoca',
};
for (const [key, name] of Object.entries(modes)) {
  test(`${name}: aceleração, direção e marcha à ré mantêm posição e colisões válidas`, () => {
    const mode = Number(key),
      player = { ...spawnForTeam(0), id: 1, mode, vehicle: 100001 };
    const origin = { x: player.x, z: player.z };
    const advance = (input, seconds) => {
      for (let i = 0; i < seconds * 60; i++) {
        stepPlayer(player, input, 1 / 60);
        for (const field of ['x', 'z', 'yaw', 'speed'])
          assert.ok(Number.isFinite(player[field]), `${name}.${field}`);
        assert.ok(player.x >= constants.BOUNDS.minX && player.x <= constants.BOUNDS.maxX);
        assert.ok(player.z >= constants.BOUNDS.minZ && player.z <= constants.BOUNDS.maxZ);
        assert.equal(canOccupyPlayer(player), true);
      }
    };
    assert.equal(canOccupyPlayer(player), true);
    advance({ x: 0, z: 1 }, 2);
    assert.ok(Math.hypot(player.x - origin.x, player.z - origin.z) > 0.1);
    assert.ok(player.speed > 0);
    const maximum = mode === 4 ? 7 : VEHICLE_TUNING[mode].forward;
    assert.ok(player.speed <= maximum + 1e-6);
    advance({ x: 1, z: 1 }, 0.5);
    advance({ x: 0, z: -1 }, 4);
    assert.ok(player.speed < 0, 'freio deve permitir marcha à ré');
    if (mode === 3)
      assert.ok(
        Math.abs(
          Math.atan2(Math.sin(player.yaw - player.trailer), Math.cos(player.yaw - player.trailer)),
        ) <=
          1.25 + 1e-6,
      );
  });
}
