import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canOccupy, constants, stepPlayer } from '../src/simulation.js';
import { handleWorldMessage } from '../src/world-actions.js';

const places = JSON.parse(readFileSync(new URL('../src/world-data.json', import.meta.url))).places;

test('acesso do ET Bilu permite caminhar da avenida até as quatro ações sem atravessar seus objetos', () => {
  const alien = places.find((place) => place.id === 'alien');
  const player = { id: 1, team: 0, x: 0, z: 120, yaw: 0, speed: 0, mode: 0 };
  // Rua transversal, corredor já visível no cliente e contorno do sólido do ET.
  const path = [
    [36, 120],
    [36, 110],
    [215, 110],
    [215, 166],
    [211, 166],
    [211, 184],
    [213, 184],
    [213, 188],
    [214, 189],
  ];
  for (const [x, z] of path) {
    let frames = 0;
    while (Math.hypot(player.x - x, player.z - z) > 0.001 && frames++ < 4000) {
      const dx = x - player.x,
        dz = z - player.z,
        distance = Math.hypot(dx, dz);
      stepPlayer(
        player,
        { x: dx / distance, z: dz / distance, run: true },
        Math.min(1 / 60, distance / constants.RUN_SPEED),
      );
      assert.ok(canOccupy(player.x, player.z), 'cada passo permanece em piso livre');
    }
    assert.ok(Math.hypot(player.x - x, player.z - z) < 0.001, `caminhada alcança ${x},${z}`);
  }
  const messages = [];
  const ctx = {
    state: {},
    players: new Map([[player.id, player]]),
    save() {},
    broadcast() {},
    sendPlayer(p, message) {
      messages.push(message);
    },
  };
  for (const action of alien.actions) {
    assert.ok(
      Math.hypot(player.x - alien.x - action.x, player.z - alien.z - action.z) <= action.radius,
      action.key,
    );
    handleWorldMessage(player, { t: 'secret_place', place: alien.id, action: action.key }, ctx);
  }
  assert.equal(messages.filter((message) => message.t === 'secret_progress').length, 4);
  assert.ok(!messages.some((message) => message.t === 'notice'));
  // O recorte dos acessos ocorre antes de reinserir os sólidos das atrações.
  for (const place of places)
    for (const solid of place.solid) {
      assert.equal(
        canOccupy(place.x + solid.x, place.z + solid.z),
        false,
        `${place.id}: sólido preservado`,
      );
    }
});
