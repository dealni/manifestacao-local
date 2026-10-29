import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { canOccupy, constants, spawnForTeam, stepPlayer } from '../src/simulation.js';
import { RACE_GATES, RACE_START } from '../src/race.js';
import { handleDebateMessage } from '../src/debate.js';
import { brasiliaLayout, landmarkSolids } from '../src/brasilia-layout.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const baseline = JSON.parse(read('analysis/brasilia-baseline.json'));
const currentSource = read('public/client.js');
const originalSource = read('analysis/client-readable.js');
function declaration(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} presente no cliente real`);
  const end = source.indexOf('\n}', start);
  assert.ok(end > start);
  return source.slice(start, end + 2);
}
function geometry(source) {
  const start = source.indexOf('const Od =');
  const end = source.indexOf('new Map(ao.map');
  assert.ok(start >= 0 && end > start, 'bloco geométrico real encontrado');
  const scope = {};
  const runtimeStart = source.indexOf('const __brasiliaLayout =');
  const runtime =
    runtimeStart >= 0
      ? source.slice(runtimeStart, source.indexOf('(function ()', runtimeStart))
      : '';
  vm.runInNewContext(
    runtime +
      source.slice(start, end) +
      '\nglobalThis.values={screens:ao,places:Od,bounds:ht,yi,DC,IC};',
    scope,
    { timeout: 10000 },
  );
  return plain(scope.values);
}
const client = geometry(currentSource);
const original = geometry(originalSource);
function gates(source, data) {
  const scope = { uo: data.DC, so: data.IC };
  vm.runInNewContext(
    `${declaration(source, 'VY')}\n${declaration(source, 'eC')}\nconst Ko={x:0,z:-400},Ta=VY();globalThis.gates=Ta.map((n,e)=>eC(Ta[e-1]??Ko,n,Ta[e+1])?.gate??n);`,
    scope,
  );
  return plain(scope.gates).map(({ x, z, yaw, width }) => ({ x, z, yaw, width }));
}
const shape = ({ id, x, z, w, d, alley, solid, actions }) => ({
  id,
  x,
  z,
  w,
  d,
  alley,
  solid,
  actions: actions.map(({ key, x, z, radius }) => ({ key, x, z, radius })),
});
const screenShape = ({ id, kind, aspect, mount, x, y, z, nx, nz, w, h }) => ({
  id,
  kind,
  aspect,
  mount,
  x,
  y,
  z,
  nx,
  nz,
  w,
  h,
});

test('Brasília mantém envelope de 520×1280 no cliente executado e na física autoritativa', () => {
  assert.deepEqual(client.bounds, baseline.bounds);
  assert.deepEqual(constants.BOUNDS, baseline.bounds);
  assert.equal(client.bounds.maxX - client.bounds.minX, 520);
  assert.equal(client.bounds.maxZ - client.bounds.minZ, 1280);
  assert.equal(constants.WALK_SPEED, 1.7);
  assert.equal(constants.RUN_SPEED, 4.6);
});

test('65 painéis conservam IDs, formatos e geometrias compatíveis em cliente e servidor', () => {
  const server = JSON.parse(read('data/media-screens.json'));
  assert.equal(client.screens.length, 65);
  assert.equal(new Set(client.screens.map((s) => s.id)).size, 65);
  assert.deepEqual(client.screens.map(screenShape), server.map(screenShape));
  const identity = ({ id, kind, aspect }) => ({ id, kind, aspect });
  assert.deepEqual(client.screens.map(identity), baseline.screens.map(identity));
  for (const screen of client.screens) {
    assert.ok([screen.x, screen.y, screen.z, screen.w, screen.h].every(Number.isFinite), screen.id);
    assert.ok(screen.w > 0 && screen.h > 0, screen.id);
    const expected = screen.aspect === '16:9' ? 16 / 9 : 9 / 16;
    assert.ok(Math.abs(screen.w / screen.h - expected) < 0.01, screen.id);
  }
});

test('13 atrações conservam lotes, sólidos, ações e posições nos dois lados', () => {
  const places = JSON.parse(read('src/world-data.json')).places;
  assert.equal(client.places.length, 13);
  assert.deepEqual(client.places.map(shape), baseline.places.map(shape));
  assert.deepEqual(client.places.map(shape), places.map(shape));
  for (const place of places)
    for (const action of place.actions) {
      // O ponto acionável pode estar junto à parede. Deve haver piso livre dentro do alcance.
      const x = place.x + action.x,
        z = place.z + action.z;
      let reachable = false;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16)
        for (const distance of [0, 0.5, 1, 2, Math.max(0.5, action.radius - 0.5)])
          if (canOccupy(x + Math.sin(angle) * distance, z + Math.cos(angle) * distance))
            reachable = true;
      assert.ok(reachable, `${place.id}/${action.key}: acesso livre dentro do raio`);
    }
});

test('circuito real do cliente e portais autoritativos mantêm coordenadas, larguras e orientação', () => {
  const expected = gates(originalSource, original);
  const actual = gates(currentSource, client);
  assert.deepEqual(actual, expected);
  assert.equal(RACE_GATES.length, expected.length);
  for (let i = 0; i < expected.length; i++)
    for (const key of ['x', 'z', 'yaw', 'width'])
      assert.ok(Math.abs(RACE_GATES[i][key] - expected[i][key]) < 1e-9, `portal ${i}/${key}`);
  assert.deepEqual(RACE_START, { x: 0, z: -400 });
});

test('HE/VE preservam exatamente índices e bytes das paredes de spray persistidas', () => {
  const extract = (source) => ({
    encoded: /const HE =\s*"([A-Za-z0-9+/=]+)"/.exec(source)?.[1],
    count: Number(/\bVE = (\d+)/.exec(source)?.[1]),
  });
  const before = extract(originalSource),
    after = extract(currentSource);
  assert.ok(before.encoded?.length > 1000);
  assert.equal(before.count, 2043);
  assert.deepEqual(after, before);
});

test('spawns dos três times e teleporte central permitem circulação real sem nascer dentro de prédio', () => {
  assert.ok(canOccupy(0, 0));
  for (const team of [0, 1, 2]) {
    const player = spawnForTeam(team),
      initial = { ...player };
    assert.ok(canOccupy(player.x, player.z), `time ${team}`);
    for (let frame = 0; frame < 60; frame++) stepPlayer(player, { z: 1, run: true }, 1 / 60);
    assert.ok(player.z - initial.z > 4.5, `time ${team}: corredor de saída`);
    assert.ok(canOccupy(player.x, player.z));
  }
});

test('três praças mantêm piso livre e aceitam criação real de mesas de debate', () => {
  const centers = [
    [-40, -49],
    [85, -65],
    [45, -340],
  ];
  for (const [x, z] of centers) {
    assert.ok(canOccupy(x, z), `mesa em ${x},${z}`);
    assert.ok(canOccupy(x - 1.32, z));
    assert.ok(canOccupy(x + 1.32, z));
    const host = { id: 1, nick: 'Revisão Brasília', x, z };
    const ctx = { players: new Map([[host.id, host]]), sendPlayer() {} };
    handleDebateMessage(
      host,
      { t: 'cm', action: 'create', x, z, yaw: 0, topic: 'Praça local', duration: 60 },
      ctx,
    );
    assert.equal(ctx.debateSessions.size, 1, `mesa criada em ${x},${z}`);
  }
});

test('circuito inteiro conserva passagem de carro com amostras de até uma unidade', () => {
  let prior = RACE_START,
    samples = 0;
  for (const [index, gate] of RACE_GATES.entries()) {
    const count = Math.ceil(Math.hypot(gate.x - prior.x, gate.z - prior.z));
    for (let i = 0; i <= count; i++) {
      const x = prior.x + ((gate.x - prior.x) * i) / count,
        z = prior.z + ((gate.z - prior.z) * i) / count;
      assert.ok(canOccupy(x, z, 1), `segmento ${index}, posição ${x},${z}`);
      samples++;
    }
    prior = gate;
  }
  assert.ok(samples > 2000);
});

test('painéis com suportes de Brasília ficam fora dos sólidos novos e têm acesso frontal', () => {
  const screens = JSON.parse(read('data/media-screens.json')).filter((s) => s.brasiliaSupport);
  assert.ok(screens.length >= 17);
  const solids = landmarkSolids(brasiliaLayout);
  const inSolid = (x, z, margin = 0.18) =>
    solids.some(
      ([sx, sz, w, d]) => Math.abs(x - sx) < w / 2 + margin && Math.abs(z - sz) < d / 2 + margin,
    );
  for (const s of screens) {
    // Amostra todo o plano, inclusive as pontas; painéis são verticais.
    for (let i = 0; i <= 20; i++) {
      const offset = (i / 20 - 0.5) * s.w,
        x = s.x - s.nz * offset,
        z = s.z + s.nx * offset;
      assert.equal(inSolid(x, z), false, `${s.id}: plano em sólido novo`);
    }
    for (const offset of [-0.32, 0.32]) {
      const x = s.x - s.nx * 0.5 - s.nz * s.w * offset,
        z = s.z - s.nz * 0.5 + s.nx * s.w * offset;
      assert.equal(inSolid(x, z), false, `${s.id}: suporte em sólido novo`);
    }
    assert.ok(
      [3, 5, 8, 12, 18, 24].some((distance) =>
        canOccupy(s.x + s.nx * distance, s.z + s.nz * distance),
      ),
      `${s.id}: acesso frontal`,
    );
  }
});

test('decoder real de spray conserva ordem das paredes e impede renderizar paredes removidas', () => {
  function surfaces(source) {
    const start = source.indexOf('H1 = (() => {'),
      end = source.indexOf('\n  kr =', start);
    assert.ok(start >= 0 && end > start);
    const expression = source.slice(start + 'H1 = '.length, end).replace(/,\s*$/, '');
    const scope = {
      HE: /const HE =\s*"([A-Za-z0-9+/=]+)"/.exec(source)[1],
      VE: 2043,
      atob,
      Uint8Array,
      DataView,
      __brasiliaLayout: brasiliaLayout,
      Ot: 4,
      $S: 4,
      Mn: 0.15,
      C4: (n) => Math.floor(n / 48),
    };
    vm.runInNewContext(
      `const H1=${expression};\nglobalThis.walls=H1;\n${declaration(source, 'gY')}`,
      scope,
    );
    return scope;
  }
  const before = surfaces(originalSource),
    after = surfaces(currentSource);
  assert.equal(after.walls.length, before.walls.length);
  let disabled = 0,
    retained = 0;
  for (let i = 0; i < after.walls.length; i++) {
    const { disabled: removed, ...geometry } = plain(after.walls[i]);
    assert.deepEqual(geometry, plain(before.walls[i]), `índice de parede ${i}`);
    const surface = after.gY(`w${i}.0`);
    if (removed) {
      disabled++;
      assert.equal(surface, null);
    } else {
      retained++;
      assert.deepEqual(plain(surface), plain(before.gY(`w${i}.0`)));
    }
  }
  assert.ok(disabled > 10);
  assert.ok(retained > 100);
});
