import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initWorld, handleWorldMessage } from '../src/world-actions.js';

const client = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const match =
  /const Xn = Object\.freeze\(\{ minX: ([\d.-]+), maxX: ([\d.-]+), minZ: ([\d.-]+), maxZ: ([\d.-]+) \}\)/.exec(
    client,
  );
assert.ok(match, 'Limites da área de paz permanecem disponíveis no cliente');
const [minX, maxX, minZ, maxZ] = match.slice(1).map(Number);

function attack(from, to) {
  const a = { id: 1, userId: 'a', team: 0, x: from[0], z: from[1] },
    b = { id: 2, userId: 'b', team: 1, x: to[0], z: to[1] };
  const broadcasts = [];
  const ctx = {
    state: {
      users: [
        { id: 'a', owned: { pvpEnabled: true } },
        { id: 'b', owned: { pvpEnabled: true } },
      ],
    },
    players: new Map([
      [1, a],
      [2, b],
    ]),
    save() {},
    broadcast(message) {
      broadcasts.push(message);
    },
  };
  initWorld(a, ctx);
  initWorld(b, ctx);
  handleWorldMessage(a, { t: 'pvp', on: true }, ctx);
  handleWorldMessage(b, { t: 'pvp', on: true }, ctx);
  broadcasts.length = 0;
  handleWorldMessage(a, { t: 'attack' }, ctx);
  return { broadcasts, counts: ctx.state.world.progress.a.mission.counts };
}

for (const [label, inside, outside] of [
  ['oeste', [minX, 0], [minX - 1, 0]],
  ['leste', [maxX, 0], [maxX + 1, 0]],
  ['sul', [0, minZ], [0, minZ - 1]],
  ['norte', [0, maxZ], [0, maxZ + 1]],
]) {
  test(`limite ${label}: quem está na área de paz não ataca`, () => {
    const result = attack(inside, outside);
    assert.equal(result.broadcasts.length, 0);
    assert.equal(result.counts.meleeHits, undefined);
  });
  test(`limite ${label}: alvo na área de paz não recebe nem soma impacto`, () => {
    const result = attack(outside, inside);
    assert.deepEqual(
      result.broadcasts[0].actions.map((action) => action.kind),
      ['attack'],
    );
    assert.equal(result.counts.meleeHits, undefined);
  });
}

test('fora da área de paz continuam válidos os impactos entre times com PvP ativo', () => {
  const result = attack([maxX + 1, 0], [maxX + 2, 0]);
  assert.deepEqual(
    result.broadcasts[0].actions.map((action) => action.kind),
    ['attack', 'hit'],
  );
  assert.equal(result.counts.meleeHits, 1);
});
