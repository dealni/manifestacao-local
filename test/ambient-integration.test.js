import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  ambientPopulation,
  createAmbientPopulation,
  applyAmbientPopulation,
} from '../scripts/ambient-population.js';
import { createAmbientAudioController, applyAmbientAudio } from '../scripts/ambient-audio.js';

test('configuração real integra nove caminhões e dois carros de som ao mixer sem alterar fontes ou participantes reais', () => {
  const population = createAmbientPopulation(ambientPopulation);
  const realSource = { p: 81, v: 82, track: 'd1' };
  const sources = new Map([[81, realSource]]);
  const participants = new Map([[81, { id: 81, x: 3, z: 4 }]]);
  const names = new Map([[81, 'Pessoa real']]);
  const vehicles = [{ id: 82, driver: 81 }];
  const serialized = JSON.stringify(ambientPopulation);
  const audio = createAmbientAudioController({
    sources: () => sources,
    population: () => population,
    now: () => 12345,
  });
  audio.update(true);
  assert.equal(sources.size, 12);
  for (const entry of population.sources) {
    const source = sources.get(entry.p);
    assert.ok(source, `Fonte real rejeitada: ${entry.item}`);
    assert.equal(source.ambient, true);
    assert.equal(source.at, 12345);
    assert.ok(population.getVehicle(source.v));
  }
  for (let second = 0; second <= 180; second += 2) {
    const actors = population.renderActors(participants, second);
    assert.equal(actors.size, 201);
    assert.equal(population.renderVehicles(vehicles, second).length, 25);
    for (const actor of actors.values())
      for (const key of ['x', 'z']) assert.ok(Number.isFinite(actor[key]));
    assert.equal(actors.get(81), participants.get(81));
  }
  assert.equal(participants.size, 1);
  assert.equal(names.size, 1);
  assert.equal(vehicles.length, 1);
  assert.equal(sources.get(81), realSource);
  assert.equal(JSON.stringify(ambientPopulation), serialized);
  audio.stop();
  assert.deepEqual([...sources.keys()], [81]);
});

test('patches conjuntos compilam sobre o cliente real e preservam física, nomes e contagem de jogadores', () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const source = applyAmbientAudio(applyAmbientPopulation(original));
  const parseable = source
    .replaceAll('import.meta.url', '"https://local.invalid/client.js"')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
  assert.doesNotThrow(() => new vm.Script(parseable));
  assert.ok(source.includes('players: Y.actors.size'));
  assert.ok(source.includes('Vi.update(P, (Q) => k.get(Q), m, Y.id, i)'));
  assert.ok(source.includes('Y.names, i, sn, Y.id, Mt, ot'));
  assert.ok(
    source.includes(
      'Bt.updateOverview(Y.overview, __ambientPopulation.renderActors(m, n / 1e3, Mt), Mt, i, n, sn, Y.looks, Ue && Y.far.wide)',
    ),
  );
  assert.ok(source.includes('this.portraits.get(mt[e.character]) ?? null'));
  assert.ok(source.includes('r.filter(source => !source.s.ambient)'));
  const phaseSource = source.match(/qA = ([^;]+),\s*XA =/s)?.[1];
  assert.ok(phaseSource, 'Seed de animação real encontrado');
  const phase = vm.runInNewContext(`(${phaseSource})`);
  for (const actor of ambientPopulation.actors)
    assert.ok(phase(actor.id) >= 0 && phase(actor.id) < 1);
});
