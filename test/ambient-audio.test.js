import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAmbientAudioController,
  releaseAmbientAudioSource,
  applyAmbientAudio,
  distinctAmbientAudioSources,
} from '../scripts/ambient-audio.js';
import { MUSIC_TRACKS, musicTracksForTeam } from '../src/music-catalog.js';
import { ambientPopulation, createAmbientPopulation } from '../scripts/ambient-population.js';

function setup() {
  let map = new Map([[7, { p: 7, track: 'd1' }]]);
  const released = [],
    vehicles = new Map([[-1001, { id: -1001, x: 2, z: 3, kind: 5, team: 0 }]]);
  const population = {
    sources: [{ p: -2001, v: -1001, team: 0, item: 'carro-som', track: 'd5', at: 0, level: 0.35 }],
    getVehicle: (id) => vehicles.get(id),
  };
  const controller = createAmbientAudioController({
    sources: () => map,
    population: () => population,
    now: () => 1234,
    release: (id) => released.push(id),
  });
  return {
    controller,
    population,
    released,
    get map() {
      return map;
    },
    replace() {
      map = new Map();
    },
  };
}

test('áudio ambiente só entra ao jogar e preserva fontes reais', () => {
  const s = setup();
  s.controller.update(false);
  assert.equal(s.map.size, 1);
  s.controller.update(true);
  const source = s.map.get(-2001);
  assert.equal(source.at, 1234);
  assert.equal(source.level, 0.3);
  assert.equal(source.ambient, true);
  assert.equal(s.map.get(7).track, 'd1');
  s.controller.update(true);
  assert.equal(s.map.size, 2);
  s.controller.update(false);
  assert.equal(s.map.size, 1);
  assert.deepEqual(s.released, [-2001]);
});
test('welcome pode substituir Map sem perder fonte e sincronismo', () => {
  const s = setup();
  s.controller.update(true);
  const source = s.map.get(-2001);
  s.replace();
  s.controller.update(true);
  assert.equal(s.map.get(-2001), source);
  assert.equal(source.at, 1234);
  s.controller.dispose();
  s.controller.update(true);
  assert.equal(s.map.size, 0);
});
test('não aceita IDs reais, links externos, tracks não locais nem veículos ausentes', () => {
  const s = setup(),
    base = s.population.sources[0];
  s.population.sources = [
    { ...base, p: 7 },
    { ...base, p: -8, track: 'https://example.com/music.mp3' },
    { ...base, p: -9, track: 'd6' },
    { ...base, p: -10, v: -999 },
    { ...base, p: -11, item: 'caixa' },
  ];
  s.controller.update(true);
  assert.equal(s.map.size, 1);
});
test('limpeza não remove fonte de outra origem que ocupou mesmo ID', () => {
  const s = setup();
  s.controller.update(true);
  const other = { p: -2001 };
  s.map.set(-2001, other);
  s.controller.stop();
  assert.equal(s.map.get(-2001), other);
  assert.deepEqual(s.released, []);
});
test('atualização não pausa fonte substituta quando a população remove o ID ambiente', () => {
  const s = setup();
  s.controller.update(true);
  const other = { p: -2001 };
  s.map.set(-2001, other);
  s.population.sources = [];
  s.controller.update(true);
  assert.equal(s.map.get(-2001), other);
  assert.deepEqual(s.released, []);
});
test('limpeza ainda libera áudio pendente se o mixer já perdeu o registro ambiente', () => {
  const s = setup();
  s.controller.update(true);
  s.map.delete(-2001);
  s.controller.stop();
  assert.deepEqual(s.released, [-2001]);
});
test('configuração real disponibiliza três carretas por time e preserva os dois carros de som', () => {
  const sources = new Map(),
    population = createAmbientPopulation(ambientPopulation);
  const controller = createAmbientAudioController({
    sources: () => sources,
    population: () => population,
  });
  controller.update(true);
  assert.equal(sources.size, 11);
  for (const [team, track] of ['d5', 'e5', 'm1'].entries()) {
    const trucks = [...sources.values()].filter(
      (s) => s.team === team && s.item === 'caminhao-som',
    );
    assert.equal(trucks.length, 3);
    assert.ok(trucks.every((s) => s.track === track && s.level === 0.3));
  }
  assert.equal([...sources.values()].filter((s) => s.item === 'carro-som').length, 2);
  assert.equal(new Set([...sources.values()].map((s) => s.v)).size, 11);
  controller.stop();
  assert.equal(sources.size, 0);
});
test('áudio ambiente rejeita música de outro time e libera fonte que saiu da população', () => {
  const s = setup(),
    base = s.population.sources[0];
  s.population.sources = [
    { ...base, track: 'e5' },
    { ...base, p: -2002, team: 3, track: undefined },
  ];
  s.controller.update(true);
  assert.equal(s.map.size, 1);
  s.population.sources = [base];
  s.controller.update(true);
  assert.equal(s.map.size, 2);
  s.population.sources = [];
  s.controller.update(true);
  assert.equal(s.map.size, 1);
  assert.deepEqual(s.released, [-2001]);
});
test('limpeza pausa imediatamente somente a voz ambiente, sem depender de outro frame', () => {
  const paused = [],
    released = [];
  const ambient = { owner: -2001, el: { pause: () => paused.push(-2001) } },
    real = { owner: 7, el: { pause: () => paused.push(7) } };
  const mixer = {
    heard: new Map(),
    ducked: new Map(),
    markers: new Map(),
    release(slot, time) {
      released.push([slot.owner, time]);
      slot.owner = 0;
      slot.releasing = time + 0.4;
    },
  };
  releaseAmbientAudioSource(
    mixer,
    { audioContext: { currentTime: 10 }, speakers: [ambient, real] },
    -2001,
  );
  assert.deepEqual(paused, [-2001]);
  assert.deepEqual(released, [[-2001, 10]]);
  assert.equal(ambient.owner, 0);
  assert.equal(ambient.releasing, 0);
  assert.equal(real.owner, 7);
});
test('patch reaproveita mixer, resolve veículo isolado e não força autoplay ou envia eventos', () => {
  const fixture = [
    'const h = Ro(d.item),',
    'const rh = new Gj(Y, dn, Bt, wn.scene, pe("#hud"), Cn),',
    '  vC(n);',
    '      if (Q.v) {\n        const $ = P.find((ie) => ie.id === Q.v);',
    '    this.mark(r, t);',
    '    const c = Nk(r, t.x, t.z, Oj);',
    '        ((e.el.currentTime = (k8(a, this.net.serverNow(), s) + dw) % s),',
  ].join('\n');
  const source = applyAmbientAudio(fixture);
  assert.ok(source.includes('__ambientAudio.update(Pt && !document.hidden)'));
  assert.ok(source.includes('Q.ambient && Pt ? __ambientPopulation.getVehicle(Q.v)'));
  assert.ok(source.includes('r.filter(source => !source.s.ambient)'));
  assert.ok(source.includes('const h = Ro(d.item),'));
  assert.ok(!source.includes('ambientAudioTier'));
  assert.ok(
    source.includes(
      'document.addEventListener("visibilitychange", () => controller.update(Pt && !document.hidden))',
    ),
  );
  assert.ok(!source.includes('.unlock('));
  assert.ok(!source.includes('Y.send('));
  assert.throws(() => applyAmbientAudio(''), /incompatível/);
});

test('playlist avança na duração exata sem reiniciar por frame ou perder fase ao reentrar', () => {
  let clock = 1000;
  const map = new Map();
  const world = {
    sources: [
      { p: -1, v: -1, team: 0, item: 'carro-som', track: 'd5' },
      { p: -2, v: -2, team: 0, item: 'caminhao-som', track: 'd5' },
      { p: -3, v: -3, team: 1, item: 'caminhao-som', track: 'e5' },
    ],
    getVehicle: (id) => ({ team: id === -3 ? 1 : 0 }),
  };
  let changes = 0;
  const controller = createAmbientAudioController({
    sources: () => map,
    population: () => world,
    now: () => clock,
    changed: () => changes++,
    tracks: [
      { id: 'first', team: 0, file: 'first.mp3', seconds: 2.5 },
      { id: 'second', team: 0, file: 'second.mp3', seconds: 1.25 },
      { id: 'other', team: 1, file: 'other.mp3', seconds: 7 },
      { id: 'external', team: 0, seconds: 30 },
      { id: 'invalid', team: 0, file: 'bad.mp3', seconds: NaN },
    ],
  });
  controller.update(true);
  const source = map.get(-1);
  assert.equal(source.track, 'first');
  assert.equal(source.at, 1000);
  clock = 3499;
  controller.update(true);
  assert.equal(changes, 1);
  assert.equal(source.at, 1000);
  clock = 3500;
  controller.update(true);
  assert.equal(source.track, 'second');
  assert.equal(source.at, 3500);
  assert.equal(map.get(-2).at, 3500);
  assert.equal(map.get(-3).track, 'other');
  assert.equal(changes, 2);
  controller.update(false);
  clock = 22505;
  controller.update(true);
  assert.equal(map.get(-1).track, 'second');
  assert.equal(map.get(-1).at, 22250);
  assert.equal(map.get(-2).at, 22250);
  clock = 23500;
  controller.update(true);
  assert.equal(map.get(-1).track, 'first');
  assert.equal(map.get(-1).at, 23500);
});

test('mixer mantém uma fonte ambiente audível por time e preserva todas as fontes reais', () => {
  const source = (id, team, x, range = 120, ambient = true) => ({
    id,
    x,
    z: 0,
    tier: { range },
    s: { ambient, team },
  });
  const candidates = [
    source(1, 0, 90),
    source(2, 0, 40),
    source(3, 1, 50),
    source(4, 1, 15, 10),
    source(5, 2, 200),
    source(6, 0, 3, 120, false),
    source(7, 0, 4, 120, false),
  ];
  assert.deepEqual(
    distinctAmbientAudioSources(candidates, { x: 0, z: 0 }).map((s) => s.id),
    [2, 3, 6, 7],
  );
  assert.deepEqual(
    distinctAmbientAudioSources(candidates, { x: 180, z: 0 }).map((s) => s.id),
    [1, 5, 6, 7],
  );
  assert.equal(candidates.length, 7);
});

test('andar na fronteira entre caminhões não reinicia a mesma música a cada frame', () => {
  const candidates = [-40, 40].map((x, index) => ({
    id: -index - 1,
    x,
    z: 0,
    tier: { range: 120 },
    s: { ambient: true, team: 0 },
  }));
  let playing = [];
  for (const x of [-0.01, 0.01, -0.02, 0.02, -1, 1, 0]) {
    const chosen = distinctAmbientAudioSources(candidates, { x, z: 0 }, playing);
    assert.deepEqual(
      chosen.map((source) => source.id),
      [-1],
    );
    playing = chosen.map((source) => source.id);
  }
  const closer = distinctAmbientAudioSources(candidates, { x: 10, z: 0 }, playing);
  assert.deepEqual(
    closer.map((source) => source.id),
    [-2],
  );
  // Nem a histerese pode manter uma fonte que já saiu do alcance.
  assert.deepEqual(
    distinctAmbientAudioSources(candidates, { x: 90, z: 0 }, [-1]).map((source) => source.id),
    [-2],
  );
  assert.deepEqual(distinctAmbientAudioSources(candidates, { x: 200, z: 0 }, [-2]), []);
});

test('catálogo selecionado inteiro roda nas fontes fixas sem faixas excluídas', () => {
  let clock = 0;
  const sources = new Map();
  const controller = createAmbientAudioController({
    sources: () => sources,
    population: () => createAmbientPopulation(ambientPopulation),
    tracks: MUSIC_TRACKS,
    now: () => clock,
  });
  for (const team of [0, 1, 2]) {
    let offset = 0;
    const playlist = musicTracksForTeam(team);
    assert.equal(playlist.length, [9, 6, 1][team]);
    for (const track of playlist) {
      clock = offset;
      controller.update(true);
      const fixed = [...sources.values()].filter((source) => source.team === team);
      assert.ok(fixed.length >= 3);
      assert.ok(fixed.every((source) => source.track === track.id && source.at === offset));
      offset += Math.round(track.seconds * 1000);
    }
    clock = offset;
    controller.update(true);
    assert.ok(
      [...sources.values()]
        .filter((source) => source.team === team)
        .every((source) => source.track === playlist[0].id && source.at === offset),
    );
  }
});
