import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  brasiliaLayout,
  shouldClearBuilding,
  isClearedPoint,
  isClearedCollider,
  landmarkSolids,
  deriveRemovedBuildings,
  landmarkAirSolids,
} from '../src/brasilia-layout.js';
import { constants, canOccupy, spawnForTeam, STATIC_COLLIDER_COUNT } from '../src/simulation.js';
import { RACE_GATES } from '../src/race.js';

test('Brasília conserva envelope, spawns e nove marcos com sólidos congruentes', () => {
  assert.deepEqual(brasiliaLayout.bounds, constants.BOUNDS);
  assert.equal(constants.BOUNDS.maxX - constants.BOUNDS.minX, 520);
  assert.equal(constants.BOUNDS.maxZ - constants.BOUNDS.minZ, 1280);
  assert.equal(brasiliaLayout.landmarks.length, 9);
  assert.equal(new Set(brasiliaLayout.landmarks.map((x) => x.id)).size, 9);
  for (const landmark of brasiliaLayout.landmarks) {
    assert.ok(landmark.x - landmark.w / 2 > -260 && landmark.x + landmark.w / 2 < 260);
    assert.ok(landmark.z - landmark.d / 2 > -640 && landmark.z + landmark.d / 2 < 640);
    for (const solid of landmark.solids) {
      assert.ok(solid.w <= landmark.w && solid.d <= landmark.d);
      assert.equal(canOccupy(landmark.x + solid.x, landmark.z + solid.z), false, landmark.id);
    }
  }
  for (let team = 0; team < 3; team++) {
    const p = spawnForTeam(team);
    assert.ok(canOccupy(p.x, p.z));
  }
});

test('regra compartilhada remove prédios inteiros e mantém colisões fora dos lotes', () => {
  assert.equal(brasiliaLayout.removedBuildings.length, 145);
  for (const building of brasiliaLayout.removedBuildings)
    assert.ok(shouldClearBuilding(building.pts, brasiliaLayout));
  assert.ok(STATIC_COLLIDER_COUNT > 3000 && STATIC_COLLIDER_COUNT < 3954);
  const solids = landmarkSolids(brasiliaLayout);
  let freeSamples = 0;
  for (const plot of brasiliaLayout.clearedPlots)
    for (let dx = -plot.w / 2 + 12; dx < plot.w / 2 - 10; dx += 12)
      for (let dz = -plot.d / 2 + 12; dz < plot.d / 2 - 10; dz += 12) {
        const x = plot.x + dx,
          z = plot.z + dz;
        if (
          solids.some(
            ([sx, sz, w, d]) => Math.abs(x - sx) < w / 2 + 1 && Math.abs(z - sz) < d / 2 + 1,
          )
        )
          continue;
        assert.ok(isClearedPoint(x, z, brasiliaLayout));
        assert.ok(canOccupy(x, z), `${plot.id} ${x},${z}`);
        freeSamples++;
      }
  assert.ok(freeSamples > 50);
});

test('novos sólidos deixam corredor da avenida, corrida e atrações existentes intactos', () => {
  const solids = landmarkSolids(brasiliaLayout);
  const overlaps = (x, z, r = 0) =>
    solids.some(([sx, sz, w, d]) => Math.abs(x - sx) < w / 2 + r && Math.abs(z - sz) < d / 2 + r);
  for (let z = -630; z <= 630; z += 5) assert.equal(overlaps(0, z, 8), false);
  for (const gate of RACE_GATES)
    assert.equal(overlaps(gate.x, gate.z, gate.width), false, JSON.stringify(gate));
  const places = JSON.parse(
    readFileSync(new URL('../src/world-data.json', import.meta.url), 'utf8'),
  ).places;
  assert.equal(places.length, 13);
  for (const p of places) {
    assert.equal(overlaps(p.x, p.z, Math.max(p.w, p.d) / 2), false, p.id);
    for (const action of p.actions)
      assert.equal(
        overlaps(p.x + action.x, p.z + action.z, action.radius),
        false,
        `${p.id}/${action.key}`,
      );
  }
});

test('paredes removidas ficam ocultas sem reindexar ou apagar spray persistido', async () => {
  const { handleWorldMessage } = await import('../src/world-actions.js');
  const source = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  const bytes = Buffer.from(/const HE =\s*"([A-Za-z0-9+/=]+)"/.exec(source)[1], 'base64');
  const count = Number(/\bVE = (\d+)/.exec(source)[1]);
  let offset = 0,
    wallIndex = 0,
    removed,
    retained;
  for (let b = 0; b < count; b++) {
    const vertices = bytes.readUInt16LE(offset),
      mh = bytes.readUInt16LE(offset + 4) / 10,
      flags = bytes[offset + 7];
    offset += 18;
    const pts = [];
    for (let i = 0; i < vertices; i++, offset += 4)
      pts.push([bytes.readInt16LE(offset) / 10, bytes.readInt16LE(offset + 2) / 10]);
    if (!(flags & 1) || flags & 4 || mh > 0.2) continue;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        z = pts[(i + 1) % pts.length];
      if (Math.hypot(z[0] - a[0], z[1] - a[1]) < 1.2) continue;
      const entry = {
        key: `w${wallIndex++}.0`,
        band: Math.floor((a[1] + ((z[1] - a[1]) / Math.hypot(z[0] - a[0], z[1] - a[1])) * 2) / 48),
      };
      if (shouldClearBuilding(pts, brasiliaLayout)) removed ??= entry;
      else retained ??= entry;
    }
  }
  assert.ok(removed && retained);
  const paint = () => ({ top: 0, layers: [[{ u: 100, v: 100, c: 2, s: 0 }], [], []] });
  const messages = [],
    ctx = {
      state: { world: { paint: { [removed.key]: paint(), [retained.key]: paint() } } },
      players: new Map(),
      sendPlayer(p, m) {
        messages.push(m);
      },
      save() {},
      broadcast() {},
    };
  const player = { id: 1, team: 0, x: 0, z: 0 };
  handleWorldMessage(player, { t: 'px_get', b: [removed.band, retained.band] }, ctx);
  assert.ok(messages.some((m) => m.g.includes(retained.key)));
  assert.ok(messages.every((m) => !m.g.includes(removed.key)));
  const before = structuredClone(ctx.state.world.paint[removed.key]);
  handleWorldMessage(player, { t: 'px', d: [removed.key, 200, 200], c: 3, s: 0 }, ctx);
  assert.deepEqual(ctx.state.world.paint[removed.key], before);
});

test('recorte inclui tiras raster na borda mesmo quando seu centro fica fora do prédio removido', () => {
  const [x, z, w, d] = [-36.17, 136.03, 8.59, 0.93];
  assert.equal(isClearedPoint(x, z, brasiliaLayout), false);
  assert.equal(isClearedCollider(x, z, w, d, brasiliaLayout), true);
  assert.equal(canOccupy(x, z), true);
  assert.equal(isClearedCollider(0, 400, 5, 5, brasiliaLayout), false);
});

test('remoção transitiva elimina quatro torres cujas bases foram retiradas, sem volumes órfãos', () => {
  const source = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const bytes = Buffer.from(/const HE =\s*"([A-Za-z0-9+/=]+)"/.exec(source)[1], 'base64');
  const count = Number(/\bVE = (\d+)/.exec(source)[1]);
  let offset = 0;
  const buildings = [];
  for (let index = 0; index < count; index++) {
    const vertices = bytes.readUInt16LE(offset),
      h = bytes.readUInt16LE(offset + 2) / 10,
      mh = bytes.readUInt16LE(offset + 4) / 10,
      id = bytes.readUInt32LE(offset + 14);
    offset += 18;
    const pts = [];
    for (let i = 0; i < vertices; i++, offset += 4)
      pts.push([bytes.readInt16LE(offset) / 10, bytes.readInt16LE(offset + 2) / 10]);
    buildings.push({ index, id, h, mh, pts });
  }
  const actual = deriveRemovedBuildings(buildings, brasiliaLayout);
  assert.deepEqual(actual, brasiliaLayout.removedBuildings);
  for (const index of [425, 486, 487, 811]) {
    const child = actual.find((b) => b.index === index);
    assert.equal(child.removalReason, 'removed-support');
    assert.ok(child.supportIndices.length > 0);
    assert.ok(shouldClearBuilding(child.pts, brasiliaLayout));
  }
  const removed = new Set(actual.map((b) => b.index));
  const inside = (x, z, pts) => {
    let yes = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [a, b] = pts[i],
        [c, d] = pts[j];
      if (b > z !== d > z && x < ((c - a) * (z - b)) / (d - b) + a) yes = !yes;
    }
    return yes;
  };
  for (const child of buildings.filter((b) => b.mh > 0.2 && !removed.has(b.index))) {
    const x = child.pts.reduce((sum, p) => sum + p[0], 0) / child.pts.length,
      z = child.pts.reduce((sum, p) => sum + p[1], 0) / child.pts.length;
    const supports = buildings.filter(
      (b) =>
        b.index !== child.index &&
        b.mh < child.mh &&
        Math.abs(b.h - child.mh) < 0.2 &&
        inside(x, z, b.pts),
    );
    assert.ok(
      !supports.length || supports.some((b) => !removed.has(b.index)),
      `volume órfão HE${child.index}`,
    );
  }
  // O fecho é transitivo e preserva um filho que ainda dispõe de outra base.
  const square = (index, mh, h, min, max) => ({
    index,
    id: index,
    mh,
    h,
    pts: [
      [min, min],
      [max, min],
      [max, max],
      [min, max],
    ],
  });
  const stacked = [square(0, 0, 10, 0, 10), square(1, 10, 20, 2, 8), square(2, 20, 30, 3, 7)];
  const layout = { clearedPlots: [{ x: 0.25, z: 0.25, w: 1, d: 1 }] };
  const result = deriveRemovedBuildings(stacked, layout);
  assert.deepEqual(
    result.map((b) => b.index),
    [0, 1, 2],
  );
  assert.deepEqual(
    result.map((b) => b.removalReason),
    ['plot', 'removed-support', 'removed-support'],
  );
  const alternate = deriveRemovedBuildings([...stacked, square(3, 0, 10, 3, 9)], layout);
  assert.deepEqual(
    alternate.map((b) => b.index),
    [0],
  );
});

test('Congresso mantém base caminhável congruente e separa torres e cúpulas na colisão aérea', () => {
  const congress = brasiliaLayout.landmarks.find((p) => p.kind === 'congress');
  assert.deepEqual(congress.solids, [{ x: 0, z: 0, w: 90, d: 72 }]);
  assert.equal(congress.airSolids.length, 5);
  const volumes = landmarkAirSolids({ landmarks: [congress] });
  const hit = (x, y, z) =>
    volumes.some(
      (v) =>
        Math.abs(x - v.x) < v.w / 2 && Math.abs(z - v.z) < v.d / 2 && y > v.bottom && y < v.height,
    );
  assert.ok(hit(congress.x + 40, 1, congress.z - 30));
  assert.equal(
    hit(congress.x + 40, 20, congress.z - 30),
    false,
    'canto da base não vira parede invisível de65m',
  );
  assert.ok(hit(congress.x - 10, 60, congress.z - 12));
  assert.equal(hit(congress.x, 30, congress.z - 12), false, 'vão entre torres livre acima da base');
  assert.ok(hit(congress.x + 25, 8, congress.z + 16));
  assert.equal(hit(congress.x + 25, 20, congress.z + 16), false, 'céu acima da cúpula livre');
});

test('dezesseis bases da Catedral cobrem nervuras sem fechar os intervalos e volumes altos são finos', () => {
  const cathedral = brasiliaLayout.landmarks.find((p) => p.kind === 'cathedral');
  assert.equal(cathedral.solids.length, 17);
  for (const base of cathedral.solids.slice(1)) {
    assert.ok(Math.abs(Math.hypot(base.x, base.z) - 20) < 1e-9);
    assert.equal(base.w, 1.1);
    assert.equal(base.d, 1.1);
    assert.equal(canOccupy(cathedral.x + base.x, cathedral.z + base.z, 0.2), false);
  }
  assert.ok(
    canOccupy(
      cathedral.x + Math.cos(Math.PI / 16) * 20,
      cathedral.z + Math.sin(Math.PI / 16) * 20,
      0.2,
    ),
  );
  const volumes = landmarkAirSolids({ landmarks: [cathedral] });
  const upper = volumes.filter((v) => v.bottom >= 17);
  assert.ok(upper.length > 16);
  assert.ok(
    upper.every((v) => v.w < 3 && v.d < 3),
    'parte superior usa peças de nervura, sem caixa maciça no céu',
  );
});
