import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import {
  ambientPopulation,
  buildAmbientPopulation,
  ambientPositionAllowed,
  createAmbientPopulation,
  applyAmbientPopulation,
  selectAmbientDetails,
  AMBIENT_SOUND_TEAM_GAP,
} from '../scripts/ambient-population.js';
import { canOccupyPlayer, vehicleCircles } from '../src/simulation.js';

test('200 figurantes determinísticos, 24 veículos e 11 fontes existentes sem nomes ou contas', () => {
  assert.deepEqual(buildAmbientPopulation(), ambientPopulation);
  assert.equal(ambientPopulation.actors.length, 200);
  assert.equal(ambientPopulation.vehicles.length, 24);
  assert.equal(ambientPopulation.sources.length, 11);
  const all = [...ambientPopulation.actors, ...ambientPopulation.vehicles];
  assert.equal(new Set(all.map((a) => a.id)).size, 224);
  for (const actor of all) {
    assert.ok(actor.id < 0);
    assert.ok(!('nick' in actor));
    assert.ok(!('userId' in actor));
    assert.ok(actor.x > -260 && actor.x < 260 && actor.z > -640 && actor.z < 640);
  }
  assert.deepEqual([...new Set(ambientPopulation.actors.map((a) => a.team))], [0, 1, 2]);
  assert.deepEqual(
    [...new Set(ambientPopulation.vehicles.map((v) => v.kind))].sort((a, b) => a - b),
    [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  );
  assert.equal(new Set(ambientPopulation.sources.map((s) => s.p)).size, 11);
  for (const team of [0, 1, 2])
    assert.equal(
      ambientPopulation.vehicles.filter((v) => v.kind === 6 && v.team === team).length,
      3,
    );
  for (const source of ambientPopulation.sources) {
    const vehicle = ambientPopulation.vehicles.find((v) => v.id === source.v);
    assert.ok(vehicle);
    assert.ok(vehicle.kind === 5 || vehicle.kind === 6);
    assert.equal(source.track, ['d5', 'e5', 'm1'][vehicle.team]);
    assert.equal(source.item, vehicle.kind === 6 ? 'caminhao-som' : 'carro-som');
  }
  assert.equal(ambientPopulation.vehicles.filter((v) => v.kind === 5).length, 2);
});
test('rotas inteiras ficam livres de sólidos, corrida, saídas e veículos ambientais', () => {
  for (const actor of ambientPopulation.actors)
    for (let step = 0; step <= 30; step++) {
      const p = {
        ...actor,
        x: actor.x + ((actor.toX - actor.x) * step) / 30,
        z: actor.z + ((actor.toZ - actor.z) * step) / 30,
      };
      assert.equal(ambientPositionAllowed(p), true, `rota ${actor.id}: ${step}`);
      assert.ok(ambientPopulation.vehicles.every((v) => Math.hypot(v.x - p.x, v.z - p.z) >= 9));
    }
  for (const v of ambientPopulation.vehicles) {
    assert.equal(canOccupyPlayer({ ...v, mode: v.kind, vehicle: v.id }), true);
    if (v.kind !== 4)
      for (const [x, z, r] of vehicleCircles(v, v.kind))
        assert.equal(ambientPositionAllowed({ x, z }, r), true);
  }
});
test('runtime anima caminhada e emotes sem mutar atores, veículos ou configuração originais', () => {
  const serialized = JSON.stringify(ambientPopulation),
    controller = createAmbientPopulation(ambientPopulation),
    real = { id: 3, x: 0, z: 0 },
    actors = new Map([[3, real]]),
    vehicles = [{ id: 5, x: 0, z: 0 }];
  const merged = controller.renderActors(actors, 12),
    cars = controller.renderVehicles(vehicles, 12);
  assert.equal(merged.size, 201);
  assert.equal(cars.length, 25);
  assert.equal(actors.size, 1);
  assert.equal(vehicles.length, 1);
  assert.equal(merged.get(3), real);
  assert.equal(actors.has(-1), false);
  assert.equal(JSON.stringify(ambientPopulation), serialized);
  const moving = ambientPopulation.actors.find((a) => a.x !== a.toX || a.z !== a.toZ);
  const poses = Array.from({ length: 30 }, (_, t) => controller.frame(t).actors.get(moving.id));
  assert.ok(poses.some((a) => a.speed > 0 && a.emote === 0));
  assert.ok(poses.some((a) => a.speed === 0));
  assert.ok(new Set(poses.map((a) => `${a.x}:${a.z}`)).size > 2);
  assert.equal(controller.getVehicle(-1001).id, -1001);
  assert.equal(controller.position(controller.sources[0]).id, -1001);
  assert.equal(controller.getVehicle(1), undefined);
});
test('funções browser não precisam de imports Node e podem rodar isoladas', () => {
  const context = vm.createContext({ config: JSON.parse(JSON.stringify(ambientPopulation)) });
  const result = vm.runInContext(
    `(${createAmbientPopulation.toString()})(config).frame(5)`,
    context,
  );
  assert.equal(result.actors.size, 200);
  assert.equal(result.vehicles.length, 24);
});

test('mobile limita decoração próxima e conserva jogadores, som e dados do mundo', () => {
  const config = JSON.parse(JSON.stringify(ambientPopulation));
  const before = JSON.stringify(config);
  const controller = createAmbientPopulation(config, { mobile: true });
  const real = { id: 81, x: 500, z: 500, character: 20 };
  const realVehicle = { id: 82, kind: 12, x: 500, z: 500 };
  const focus = { x: 0, z: 0 };
  const frame = controller.frame(10, focus);
  assert.ok(frame.actors.size > 0 && frame.actors.size <= 24);
  for (const actor of frame.actors.values())
    assert.ok(Math.hypot(actor.x - focus.x, actor.z - focus.z) <= 83);
  assert.ok(frame.vehicles.length > 0 && frame.vehicles.length < config.vehicles.length);
  for (const vehicle of frame.vehicles) {
    assert.ok([5, 6].includes(vehicle.kind));
    assert.ok(Math.hypot(vehicle.x - focus.x, vehicle.z - focus.z) <= 160);
  }
  assert.equal(controller.frame(10.01, focus), frame);
  assert.equal(controller.renderActors(new Map([[81, real]]), 10, focus).get(81), real);
  assert.equal(controller.renderVehicles([realVehicle], 10, focus)[0], realVehicle);
  for (const source of controller.sources) assert.ok(controller.getVehicle(source.v));
  const far = controller.frame(11, { x: 2000, z: 2000 });
  assert.equal(far.actors.size, 0);
  assert.equal(far.vehicles.length, 0);
  assert.equal(JSON.stringify(config), before);
});
test('mobile recalcula decoração ao mudar foco no mesmo tick de animação', () => {
  const controller = createAmbientPopulation(ambientPopulation, { mobile: true });
  const near = controller.frame(10, { x: 0, z: 0 });
  assert.ok(near.actors.size > 0);
  const far = controller.frame(10.01, { x: 2000, z: 2000 });
  assert.equal(far.actors.size, 0);
  assert.equal(far.vehicles.length, 0);
  assert.notEqual(far, near);
  assert.equal(controller.frame(10.02, { x: 2000, z: 2000 }), far);
  assert.ok(controller.frame(10.02, { x: 0, z: 0 }).actors.size > 0);
});

test('pessoas reais mantêm prioridade e figurantes detalhados respeitam orçamento e limite móvel', () => {
  const rows = [
    { id: 1, visible: true, eyeDistance: 2, cost: 2 },
    ...Array.from({ length: 200 }, (_, i) => ({
      id: -i - 1,
      visible: true,
      eyeDistance: 3 + i / 100,
      cost: 1,
    })),
  ];
  const select = (real) => new Set(real.map((r) => r.id));
  assert.equal(selectAmbientDetails(select, rows, 1, 24, true).size, 3);
  assert.equal(selectAmbientDetails(select, rows, 1, 44, false).size, 11);
  assert.deepEqual([...selectAmbientDetails(select, rows, 1, 2, true)], [1]);
  assert.equal(selectAmbientDetails(select, rows, 1, 24, true, 3).size, 3);
});
test('patches somente renderização preservam física, estatísticas e mapas de nomes', () => {
  const fixture =
    'const s = t ? (this.physical?.weapon(e.state.id) ?? "push") : "push";\nconst K = !J && !E && !b && !!this.physical?.enabled(u.id);\nconst qA = (n) => (n * 0.618034) % 1;\nconst rh = new Gj();\nconst a = this.portraits.get(mt[e.character]), empty = null;\nBt.updateOverview(Y.overview, m, Mt, i, n, sn, Y.looks, Ue && Y.far.wide);\nconst h = EO(d, s, this.detailBudget, this.mobile, this.detailLimit);\nBt.updateVehicles(P, i, Mt);\nBt.update(m, Y.names, i, sn, Y.id, Mt, ot);\nVi.update(P, (Q) => k.get(Q), m, Y.id, i);';
  const patched = applyAmbientPopulation(fixture);
  const phaseSource = patched.match(/qA = ([^;]+);/)[1],
    phase = vm.runInNewContext(`(${phaseSource})`);
  for (let id = -1; id >= -200; id--) assert.ok(phase(id) >= 0 && phase(id) < 1);
  for (let id = 1; id <= 100; id++) assert.equal(phase(id), (id * 0.618034) % 1);
  assert.ok(
    patched.includes(
      'Bt.updateOverview(Y.overview, __ambientPopulation.renderActors(m, n / 1e3, Mt), Mt',
    ),
  );
  assert.ok(patched.includes('const a = this.portraits.get(mt[e.character]) ?? null,'));
  assert.ok(patched.includes('Vi.update(P, (Q) => k.get(Q), m, Y.id, i)'));
  assert.ok(patched.includes('Y.names, i, sn, Y.id'));
  assert.ok(!patched.includes('Y.actors.set'));
  assert.ok(!patched.includes('Y.names.set'));
  assert.throws(() => applyAmbientPopulation('missing'), /incompatível/);
  for (const source of ambientPopulation.sources)
    assert.ok(
      readFileSync(new URL(`../public/assets/audio/som/${source.track}.mp3`, import.meta.url))
        .length > 100,
    );
});

test('figurantes mantêm os cinco modelos básicos e todos os objetos distribuídos', () => {
  assert.deepEqual(
    [...new Set(ambientPopulation.actors.map((actor) => actor.character))].sort(),
    [0, 1, 2, 3, 4],
  );
  assert.ok(ambientPopulation.actors.every((actor) => !actor.skin));
  const flags = new Set(
    ambientPopulation.actors.map(
      (a) => ((a.appearance >>> 12) & 15) | (((a.appearance >>> 19) & 1) << 4),
    ),
  );
  for (const flag of [21, 22, 23, 24, 25, 26]) assert.ok(flags.has(flag));
  assert.deepEqual(
    [...new Set(ambientPopulation.actors.map((a) => a.ambientWeapon).filter(Boolean))].sort(),
    ['dialogo', 'foam', 'pillow', 'fish', 'blades'].sort(),
  );
  for (const actor of ambientPopulation.actors)
    if (actor.ambientWeapon)
      assert.equal(((actor.appearance >>> 12) & 15) | (((actor.appearance >>> 19) & 1) << 4), 0);
});

test('carros e caminhões de som ficam em filas dos dois lados nos três grupos centrais', () => {
  const sound = ambientPopulation.vehicles.filter((v) => v.kind === 5 || v.kind === 6);
  assert.equal(sound.length, 11);
  for (const v of sound) {
    assert.equal(Math.abs(v.x), 40);
    assert.ok(Math.abs(v.z) <= 165);
  }
  for (const team of [0, 1, 2]) {
    const group = sound.filter((v) => v.team === team);
    assert.deepEqual([...new Set(group.map((v) => Math.sign(v.x)))].sort(), [-1, 1]);
    assert.ok(Math.max(...group.map((v) => v.z)) - Math.min(...group.map((v) => v.z)) <= 60);
  }
  for (const a of sound)
    for (const b of sound) {
      if (a.team === b.team) continue;
      const distance = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(distance >= AMBIENT_SOUND_TEAM_GAP, `times ${a.team}/${b.team}: ${distance}m`);
    }
});
