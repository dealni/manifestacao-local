import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { applyBrasiliaScene, brasiliaLayout } from '../scripts/brasilia-scene.js';
import { isClearedPoint, collisionLandmarks } from '../src/brasilia-layout.js';
const original = fs.readFileSync(
  new URL('../analysis/client-readable.js', import.meta.url),
  'utf8',
);
const patched = applyBrasiliaScene(original);

test('patch Brasília preserva limites, catálogo de prédios e índices das superfícies', () => {
  assert.ok(
    patched.includes('const ht = { minX: -260, maxX: 260, minZ: -640, maxZ: PC.halfLength }'),
  );
  const encoded = original.slice(original.indexOf('const HE ='), original.indexOf('  qU = ['));
  assert.ok(patched.includes(encoded));
  assert.ok(patched.includes('disabled: __brasiliaLayout.removedBuildings.some(b=>b.index===a)'));
  assert.ok(patched.includes('if (!a || a.disabled || i * Ot >= a.L) return null;'));
  assert.throws(() => applyBrasiliaScene(patched), /incompatível|ambíguo/);
});

test('marcos procedurais e reservas dos modelos usam geometria finita e escala limitada', () => {
  const boxes = [],
    beams = [],
    meshes = [],
    quads = [];
  class Geometry {
    vertexCount = 0;
    quad(...v) {
      quads.push(v);
      this.vertexCount += 4;
    }
    box(...v) {
      boxes.push(v);
      (this.boxes ??= []).push(v);
      this.vertexCount += 24;
    }
    beam(a, b, w) {
      beams.push([a, b, w]);
      this.vertexCount += 24;
    }
    build() {
      return { boxes: this.boxes ?? [] };
    }
  }
  class Mesh {
    position = {
      x: 0,
      y: 0,
      z: 0,
      set(x, y, z) {
        Object.assign(this, { x, y, z });
      },
    };
    scale = { x: 1, y: 1, z: 1 };
    rotation = { z: 0 };
    constructor(geometry, material) {
      Object.assign(this, { geometry, material });
    }
  }
  const scope = {
    ct: class {
      children = [];
      add(object) {
        this.children.push(object);
      }
    },
    Hn: class {},
    On: Geometry,
    ge: Mesh,
    Ia: class {},
    At: class {},
    Ht: 2,
    Mn: 0.15,
    HU: () => ({
      onBeforeCompile(shader) {
        shader.fragmentShader =
          'streets(vWorld.xz); if(min(min(gStreetX,gStreetZ),gRibbon)<0.1) discard;';
      },
    }),
  };
  vm.createContext(scope);
  // Só a extensão procedural; o renderer original não é inicializado no teste.
  vm.runInContext(patched.slice(0, patched.indexOf(original.slice(0, 300))) + '\n', scope, {
    timeout: 2000,
  });
  const builder = {
    group: {
      children: [],
      add(mesh) {
        this.children.push(mesh);
        meshes.push(mesh);
      },
    },
    antenna() {
      const mast = new Mesh({}, {});
      this.group.add(mast);
    },
  };
  vm.runInContext('__brasiliaStartModels = () => {};', scope);
  scope.__brasiliaScene(builder);
  assert.ok(boxes.length > 140);
  assert.equal(beams.length, 0); // Nervuras agora vêm do GLB, sem duplicar a Catedral procedural.
  for (const v of boxes) {
    assert.ok(v.every(Number.isFinite));
    const [x, y, z, w, h, d] = v;
    assert.ok(w > 0 && h > 0 && d > 0);
    assert.ok(x - w / 2 >= -260 && x + w / 2 <= 260 && z - d / 2 >= -640 && z + d / 2 <= 640);
    assert.ok(y + h / 2 < 100);
  }
  for (const [a, b, w] of beams)
    assert.ok([...Object.values(a), ...Object.values(b), w].every(Number.isFinite));
  assert.equal(quads.length, brasiliaLayout.clearedPlots.length);
  assert.equal(
    meshes.filter((mesh) => mesh.name?.startsWith('brasilia-modelo-reserva-')).length,
    13,
  );
  for (const model of brasiliaLayout.models) {
    const fallback = meshes.find((mesh) => mesh.name === 'brasilia-modelo-reserva-' + model.id);
    assert.ok(fallback, model.id);
    assert.equal(fallback.children.length, 1);
    for (const [x, y, z, w, h, d] of fallback.children[0].geometry.boxes) {
      assert.ok(Math.abs(x - model.x) + w / 2 <= model.w / 2 + 0.1, model.id);
      assert.ok(Math.abs(z - model.z) + d / 2 <= model.d / 2 + 0.1, model.id);
      assert.ok(y - h / 2 >= 0.15 - 0.1 && y + h / 2 <= 0.15 + model.h + 0.1, model.id);
    }
  }
  const gardens = meshes.find((m) => m.name === 'brasilia-gramados');
  assert.ok(gardens);
  const shader = { fragmentShader: '' };
  gardens.material.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('<4.0 || abs(vWorld.x)<34.5'));
  assert.ok(!meshes.some((m) => m.name === 'brasilia-congresso-cupula-concava'));
  assert.ok(!meshes.some((m) => m.name === 'brasilia-congresso-cupula-convexa'));
});

test('predicado de limpeza incorporado coincide com servidor', () => {
  const runtime = patched.slice(0, patched.indexOf('function __brasiliaScene('));
  const scope = {};
  vm.createContext(scope);
  vm.runInContext(runtime, scope);
  for (let x = -250; x <= 250; x += 11)
    for (let z = -630; z <= 630; z += 13)
      assert.equal(scope.__brasiliaClearPoint(x, z), isClearedPoint(x, z, brasiliaLayout));
});

test('minimapa desenha modelos e marcos mantidos antes das ruas', () => {
  const calls = [];
  const context = {
    fillStyle: '',
    fillRect(x, z, w, d) {
      calls.push({ color: this.fillStyle, x, z, w, d });
    },
    strokeRect() {},
  };
  const canvas = {
    getContext() {
      return context;
    },
  };
  const scope = {
    document: {
      createElement() {
        return canvas;
      },
    },
    MC: [['background', 'street', 'building']],
    u8: () => 1,
    ht: brasiliaLayout.bounds,
    _t: 22,
    so: [],
    uo: [],
    lh: [],
    Ut: { minX: 37, maxX: 139, minZ: -143, maxZ: 7 },
    tt: { x: -40, z: -28, w: 30, d: 71 },
    Xn: { minX: -106, maxX: 28, minZ: -72, maxZ: 16 },
  };
  vm.createContext(scope);
  const prefix = patched.slice(0, patched.indexOf(original.slice(0, 300)));
  const map = patched.slice(patched.indexOf('function BW('), patched.indexOf('function _W('));
  vm.runInContext(prefix + '\nlet fm;\n' + map, scope);
  scope.BW(520, 1280, 0);
  for (const mark of collisionLandmarks(brasiliaLayout)) {
    const color = mark.kind === 'ministry' ? '#d7dfd2' : '#eeeade';
    assert.ok(
      calls.some(
        (c) =>
          c.color === color &&
          Math.abs(c.x - (260 + mark.x - mark.w / 2)) < 1e-8 &&
          Math.abs(c.z - (640 + mark.z - mark.d / 2)) < 1e-8 &&
          Math.abs(c.w - mark.w) < 1e-8 &&
          Math.abs(c.d - mark.d) < 1e-8,
      ),
      mark.id,
    );
  }
  assert.equal(calls.filter((c) => c.color === '#d7dfd2' || c.color === '#eeeade').length, 20);
  const road = calls.findIndex((c) => c.color === 'street');
  assert.equal(
    calls.slice(1, road).filter((c) => c.color === '#597b56').length,
    brasiliaLayout.clearedPlots.length,
  );
  assert.ok(calls.some((c) => c.color === '#d8d5c9'));
  assert.ok(!calls.some((c) => c.color === '#c0473a'));
});

test('Roadster e volumes aéreos usam prédios restantes e alturas dos componentes', () => {
  const prefix = patched.slice(0, patched.indexOf(original.slice(0, 300)));
  const kk = original
    .slice(original.indexOf('const Kk = ['), original.indexOf('  Zk = {'))
    .replace(/,\s*$/, ';');
  const vx = patched
    .slice(patched.indexOf('  vx = ['), patched.indexOf('  yr = 16,'))
    .trim()
    .replace(/^vx = /, 'const vx = ')
    .replace(/,\s*$/, ';');
  const scope = {
    Yt: [],
    bt: () => 0.15,
    Zw: (points) => [points],
    wx: () => false,
    Zk: {},
    tt: {},
    Qt: {},
    ao: [],
    xr: [],
  };
  vm.createContext(scope);
  vm.runInContext(
    prefix +
      kk +
      vx +
      '\nthis.volumes=vx;this.solids=__brasiliaSolids;this.originalKk=Kk;this.ground=__brasiliaGroundSolids;',
    scope,
  );
  const polygons = scope.volumes.filter((v) => v.polygon);
  const remaining = scope.originalKk.filter(
    (v) =>
      !brasiliaLayout.removedBuildings.some(
        (r) => JSON.stringify(r.pts) === JSON.stringify(v.points),
      ),
  );
  assert.ok(remaining.length < scope.originalKk.length);
  for (const removed of brasiliaLayout.removedBuildings)
    assert.ok(
      !polygons.some((v) => JSON.stringify(v.polygon) === JSON.stringify(removed.pts)),
      `volume antigo ${removed.id}`,
    );
  for (const solid of scope.solids) {
    assert.ok(
      polygons.some(
        (v) =>
          Math.abs(v.x - solid.x) < 1e-8 &&
          Math.abs(v.z - solid.z) < 1e-8 &&
          Math.abs(v.w - solid.w) < 1e-8 &&
          Math.abs(v.d - solid.d) < 1e-8 &&
          Math.abs(v.bottom - 0.15 - solid.bottom) < 1e-8 &&
          Math.abs(v.top - 0.15 - solid.height) < 1e-8,
      ),
    );
  }
  assert.ok(
    patched.indexOf('lh.push(...__brasiliaSolids)') < patched.indexOf('for (const n of lh)'),
  );
  assert.ok(patched.includes('...lh.filter(s=>!s.brasilia),\n    ...__brasiliaGroundSolids'));
  scope.lh = scope.solids;
  scope.Mn = 0.15;
  scope._ = class {
    constructor(x, y, z) {
      Object.assign(this, { x, y, z });
    }
  };
  scope.Sn = class {
    constructor(min, max) {
      Object.assign(this, { min, max });
    }
  };
  const aerialIndex = patched.slice(
    patched.indexOf('const lS = lh.map('),
    patched.indexOf('lS.push('),
  );
  vm.runInContext(aerialIndex + '\nthis.aerialBoxes=lS;', scope);
  assert.equal(scope.aerialBoxes.length, scope.solids.length);
  for (let i = 0; i < scope.solids.length; i++) {
    const solid = scope.solids[i],
      box = scope.aerialBoxes[i];
    assert.ok(Math.abs(box.max.y - (0.15 + solid.height + 0.5)) < 1e-8);
    assert.ok(Math.abs(box.min.y - (solid.bottom ? 0.15 + solid.bottom : 0)) < 1e-8);
  }
  const congress = brasiliaLayout.models.find((p) => p.id === 'congresso');
  for (const component of congress.airSolids) {
    assert.ok(
      scope.solids.some(
        (s) =>
          Math.abs(s.x - (congress.x + component.x)) < 1e-8 &&
          Math.abs(s.z - (congress.z + component.z)) < 1e-8 &&
          Math.abs(s.height - ((component.y ?? 0) + component.h)) < 1e-8,
      ),
    );
  }
});
