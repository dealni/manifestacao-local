import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  brasiliaLayout as layout,
  collisionLandmarks,
  landmarkSolids,
  landmarkAirSolids,
} from '../src/brasilia-layout.js';
import { canOccupy } from '../src/simulation.js';

const assets = JSON.parse(
  readFileSync(new URL('../data/brasilia-model-assets.json', import.meta.url)),
);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const overlap = (a, b, margin = 0) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + margin;

test('13 modelos preservam proporções dos GLBs medidos, incluindo offsets e rotações', () => {
  assert.equal(layout.models.length, 13);
  assert.equal(new Set(layout.models.map((m) => m.id)).size, 13);
  for (const model of layout.models) {
    const asset = assets.models.find((asset) => asset.id === model.id);
    assert.ok(asset, model.id);
    assert.equal(model.path, asset.path);
    assert.equal(model.sha256, asset.sha256);
    assert.deepEqual(model.bounds, asset.bounds);
    const [x, y, z] = asset.bounds.size,
      c = Math.abs(Math.cos(model.rotation)),
      s = Math.abs(Math.sin(model.rotation));
    assert.ok(Number.isFinite(model.scale) && model.scale > 0);
    near(model.w, (x * c + z * s) * model.scale);
    near(model.d, (x * s + z * c) * model.scale);
    near(model.h, y * model.scale);
    for (const value of [model.x, model.z, model.w, model.d, model.h])
      assert.ok(Number.isFinite(value));
  }
});

test('modelos cabem inteiramente nos lotes já limpos, sem deslocar ministérios ou Torre', () => {
  assert.deepEqual(layout.bounds, { minX: -260, maxX: 260, minZ: -640, maxZ: 640 });
  assert.equal(layout.landmarks.length, 9);
  assert.equal(layout.removedBuildings.length, 145);
  const retained = layout.landmarks.filter(
    (mark) => !layout.models.some((model) => model.fallbackId === mark.id),
  );
  for (const model of layout.models) {
    assert.ok(
      layout.clearedPlots.some(
        (p) =>
          Math.abs(model.x - p.x) + model.w / 2 <= p.w / 2 &&
          Math.abs(model.z - p.z) + model.d / 2 <= p.d / 2,
      ),
      model.id,
    );
    for (const mark of retained)
      assert.equal(overlap(model, mark, 0.5), false, `${model.id}/${mark.id}`);
  }
  for (let i = 0; i < layout.models.length; i++)
    for (let j = i + 1; j < layout.models.length; j++) {
      assert.equal(
        overlap(layout.models[i], layout.models[j], 0.5),
        false,
        `${layout.models[i].id}/${layout.models[j].id}`,
      );
    }
});

test('física compartilha os envelopes visuais e substitui colisões dos dois fallbacks', () => {
  const active = collisionLandmarks(layout),
    ground = landmarkSolids(layout),
    air = landmarkAirSolids(layout);
  assert.equal(active.length, 20);
  for (const model of layout.models) {
    assert.ok(
      !active.some((mark) => layout.landmarks.includes(mark) && mark.id === model.fallbackId),
    );
    for (const solid of model.solids)
      assert.ok(
        ground.some(
          ([x, z, w, d]) =>
            x === model.x + solid.x && z === model.z + solid.z && w === solid.w && d === solid.d,
        ),
      );
    for (const solid of model.airSolids)
      assert.ok(
        air.some(
          (v) =>
            v.x === model.x + solid.x &&
            v.z === model.z + solid.z &&
            v.w === solid.w &&
            v.d === solid.d &&
            v.bottom === solid.y &&
            v.height === solid.y + solid.h,
        ),
      );
    assert.equal(canOccupy(model.x, model.z, 0.2), false, model.id);
  }
  // Dados legados continuam utilizáveis por ferramentas e migrações sem a camada GLB.
  assert.equal(collisionLandmarks({ landmarks: layout.landmarks }).length, 9);
});

test('volumes aéreos medidos preservam o vão entre torres e o céu fora das nervuras', () => {
  const congress = layout.models.find((m) => m.id === 'congresso');
  const cathedral = layout.models.find((m) => m.id === 'catedral');
  const hit = (model, x, y, z) =>
    model.airSolids.some(
      (s) => Math.abs(x - s.x) < s.w / 2 && Math.abs(z - s.z) < s.d / 2 && y > s.y && y < s.y + s.h,
    );
  const point = (model, x, y, z) => [
    (x - model.bounds.center[0]) * model.scale,
    (y - model.bounds.min[1]) * model.scale,
    (z - model.bounds.center[2]) * model.scale,
  ];
  assert.equal(hit(congress, ...point(congress, 1, 60, 12)), false, 'vão real entre as torres');
  assert.equal(
    hit(congress, ...point(congress, -15, 60, 12)),
    true,
    'torre esquerda continua sólida',
  );
  assert.equal(
    hit(congress, ...point(congress, 15, 60, 12)),
    true,
    'torre direita continua sólida',
  );
  assert.equal(hit(cathedral, 20, 20, 20), false, 'canto vazio não vira parede no céu');
  assert.ok(cathedral.airSolids.length > 16 && cathedral.airSolids.length < 300);
  assert.ok(congress.airSolids.length > 5 && congress.airSolids.length < 100);
});
