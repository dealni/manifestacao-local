import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyMusicPlaybackClient } from '../scripts/music-playback-client.js';
import { applyAmbientAudio, releaseAmbientAudioSource } from '../scripts/ambient-audio.js';

const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
const corrected = applyMusicPlaybackClient(original);

function method(source, name, next) {
  const start = source.indexOf(`  ${name}(`, source.indexOf('class Gj '));
  const end = source.indexOf(`\n  ${next}(`, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

function fixture(source = corrected, options = {}) {
  let now = 0,
    position = options.position ?? 0,
    plays = 0;
  const seeks = [];
  const runtime = {
    performance: { now: () => now },
    Gk: 0.25,
    dw: 0.06,
    k8: (at, clock, duration) => ((clock - at) / 1000) % duration,
    Uk: (actual, expected) => actual - expected,
    Tn: { os: options.os ?? 'other' },
  };
  const sync = vm.runInNewContext(
    `({${method(source, 'keepInStep', 'wrap')}}).keepInStep`,
    runtime,
  );
  const element = {
    seeking: false,
    readyState: 4,
    paused: false,
    play() {
      plays++;
      return Promise.resolve();
    },
    get currentTime() {
      return position;
    },
    set currentTime(value) {
      seeks.push(value);
      position = value;
    },
    ...options,
  };
  const slot = { el: element, checked: 0 };
  const sound = { audioContext: { state: 'running' } };
  return {
    element,
    slot,
    sound,
    seeks,
    get plays() {
      return plays;
    },
    positionAt(value) {
      position = value;
    },
    step(time) {
      now = time;
      sync.call({ sound, net: { serverNow: () => now } }, slot, 0, 100);
    },
  };
}

test('busca pendente não recebe os reposicionamentos repetidos do mixer original', () => {
  const baseline = fixture(original, { seeking: true });
  const guarded = fixture(corrected, { seeking: true });
  for (let time = 500; time <= 3000; time += 500) {
    baseline.step(time);
    guarded.step(time);
  }
  assert.equal(baseline.seeks.length, 6);
  assert.equal(guarded.seeks.length, 0);
  assert.equal(guarded.slot.checked, 0);
  guarded.element.seeking = false;
  guarded.step(3500);
  assert.deepEqual(guarded.seeks, [3.56]);
});

test('aguarda o seek inicial da faixa antes de tentar sincronizar por frame', () => {
  const f = fixture(corrected, { readyState: 4 });
  f.slot.musicLoading = true;
  f.step(500);
  f.step(1000);
  assert.equal(f.seeks.length, 0);
  f.slot.musicLoading = false;
  f.step(1500);
  assert.deepEqual(f.seeks, [1.56]);
});

test('iOS não persegue desvio estável de Web Audio e ainda corrige atrasos grandes', () => {
  const baseline = fixture(original, { os: 'ios' });
  const guarded = fixture(corrected, { os: 'ios' });
  for (let time = 500; time <= 25000; time += 500) {
    baseline.positionAt(time / 1000 - 0.35);
    guarded.positionAt(time / 1000 - 0.35);
    baseline.step(time);
    guarded.step(time);
  }
  assert.equal(baseline.seeks.length, 50);
  assert.equal(guarded.seeks.length, 0);
  guarded.positionAt(25.1);
  guarded.step(26000); // 900 ms não provocam uma busca.
  assert.equal(guarded.seeks.length, 0);
  guarded.positionAt(25.4);
  guarded.step(26500); // 1,1 s continua sendo corrigido.
  assert.deepEqual(guarded.seeks, [26.56]);
  for (const os of ['android', 'mac', 'windows', 'other']) {
    const normal = fixture(corrected, { os });
    normal.positionAt(0.15);
    normal.step(500);
    assert.deepEqual(normal.seeks, [0.56]);
  }
});

test('aguarda dados suficientes e retoma a correção quando o buffer está disponível', () => {
  for (const readyState of [0, 1, 2]) {
    const f = fixture(corrected, { readyState, paused: true });
    f.step(500);
    f.step(1000);
    assert.equal(f.seeks.length, 0);
    assert.equal(f.plays, 0);
    f.element.readyState = 3;
    f.step(1500);
    assert.deepEqual(f.seeks, [1.56]);
    assert.equal(f.plays, 1);
  }
});

test('contexto suspenso, interrompido, fechado ou ausente não dispara correções', () => {
  for (const state of ['suspended', 'interrupted', 'closed', null]) {
    const f = fixture(corrected, { paused: true });
    f.sound.audioContext = state ? { state } : undefined;
    f.step(500);
    f.step(1000);
    assert.equal(f.seeks.length, 0);
    assert.equal(f.plays, 0);
    f.sound.audioContext = { state: 'running' };
    f.step(1500);
    assert.deepEqual(f.seeks, [1.56]);
    assert.equal(f.plays, 1);
  }
});

test('mídia pronta preserva cadência, tolerância e alvo do sincronismo original', () => {
  for (const options of [{}, { position: 0.4 }, { paused: true }]) {
    const baseline = fixture(original, options);
    const guarded = fixture(corrected, options);
    for (const time of [100, 499, 500, 750, 999, 1000, 1500]) {
      baseline.step(time);
      guarded.step(time);
      assert.deepEqual(guarded.seeks, baseline.seeks);
      assert.equal(guarded.plays, baseline.plays);
      assert.equal(guarded.slot.checked, baseline.slot.checked);
    }
  }
});

test('callback de faixa anterior não libera o sincronizador da faixa atual', () => {
  const guardedLoad = method(
    applyMusicPlaybackClient(applyAmbientAudio(original)),
    'load',
    'keepInStep',
  );
  const load = vm.runInNewContext(`({${guardedLoad}}).load`, {
    performance: { now: () => 1000 },
    ci: (file) => file,
    k8: () => 10,
    dw: 0.06,
  });
  const callbacks = [],
    seeks = [];
  let plays = 0;
  const slot = {
    el: {
      src: '',
      readyState: 1,
      addEventListener(event, callback) {
        callbacks.push(callback);
      },
      load() {},
      play() {
        plays++;
        return Promise.resolve();
      },
      set currentTime(value) {
        seeks.push(value);
      },
    },
  };
  const mixer = { net: { serverNow: () => 10000 } };
  load.call(mixer, slot, 'a.mp3', 'a', 0, 100);
  load.call(mixer, slot, 'b.mp3', 'b', 1000, 100);
  assert.equal(slot.musicLoading, true);
  callbacks[0]();
  assert.equal(slot.musicLoading, true);
  assert.equal(seeks.length, 0);
  callbacks[1]();
  assert.equal(slot.musicLoading, false);
  assert.deepEqual(seeks, [10.06]);
  assert.equal(plays, 1);
  slot.el.src = 'b.mp3';
  load.call(mixer, slot, 'b.mp3', 'b', 1000, 100);
  assert.equal(slot.musicLoading, false);
  assert.equal(plays, 2);
});

test('metadados tardios não reiniciam fonte ambiente removida ao ocultar ou sair', () => {
  const load = vm.runInNewContext(
    `({${method(applyMusicPlaybackClient(applyAmbientAudio(original)), 'load', 'keepInStep')}}).load`,
    {
      performance: { now: () => 1000 },
      ci: (file) => file,
      k8: () => 10,
      dw: 0.06,
    },
  );
  let loaded;
  let plays = 0;
  let seeks = 0;
  let pauses = 0;
  const slot = {
    owner: -2001,
    el: {
      src: '',
      addEventListener(_event, callback) {
        loaded = callback;
      },
      load() {},
      pause() {
        pauses++;
      },
      play() {
        plays++;
        return Promise.resolve();
      },
      set currentTime(_value) {
        seeks++;
      },
    },
  };
  const mixer = {
    net: { serverNow: () => 10000 },
    heard: new Map(),
    ducked: new Map(),
    markers: new Map(),
    release(target) {
      target.owner = 0;
    },
  };
  load.call(mixer, slot, 'a.mp3', 'a', 0, 100);
  releaseAmbientAudioSource(mixer, { audioContext: { currentTime: 1 }, speakers: [slot] }, -2001);
  loaded();
  assert.equal(slot.musicLoading, false);
  assert.equal(slot.track, null);
  assert.equal(pauses, 1);
  assert.equal(plays, 0);
  assert.equal(seeks, 0);
  // Uma reprodução posterior continua podendo reaproveitar o mesmo elemento.
  load.call(mixer, slot, 'b.mp3', 'b', 1000, 100);
  loaded();
  assert.equal(plays, 1);
  assert.equal(seeks, 1);
});

test('integra no cliente original preservando o loop das faixas', () => {
  assert.equal(method(corrected, 'wrap', 'pump'), method(original, 'wrap', 'pump'));
  const parseable = corrected
    .replaceAll('import.meta.url', '"https://local.invalid/client.js"')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
  assert.doesNotThrow(() => new vm.Script(parseable));
  assert.throws(() => applyMusicPlaybackClient(''), /incompatível/);
  assert.throws(() => applyMusicPlaybackClient(corrected), /incompatível/);
  assert.throws(() => applyMusicPlaybackClient(original + original), /ambíguo/);
});

test('cargas A→B→A só aceitam os metadados da última geração e aguardam metadata na mesma URL', () => {
  const load = vm.runInNewContext(`({${method(corrected, 'load', 'keepInStep')}}).load`, {
    performance: { now: () => 0 },
    ci: (file) => file,
    k8: () => 0,
    dw: 0.06,
  });
  const callbacks = [];
  let plays = 0;
  const slot = {
    el: {
      src: '',
      readyState: 0,
      addEventListener(_event, callback) {
        callbacks.push(callback);
      },
      load() {},
      play() {
        plays++;
        return Promise.resolve();
      },
      set currentTime(_value) {
        assert.ok(this.readyState >= 1);
      },
    },
  };
  const mixer = { net: { serverNow: () => 0 } };
  load.call(mixer, slot, 'a.mp3', 'a', 0, 100);
  load.call(mixer, slot, 'b.mp3', 'b', 0, 100);
  load.call(mixer, slot, 'a.mp3', 'a', 0, 100);
  // Repetir a URL enquanto carrega não deve buscar antes dos metadados.
  load.call(mixer, slot, 'a.mp3', 'a', 0, 100);
  assert.equal(callbacks.length, 4);
  slot.el.readyState = 1;
  callbacks.slice(0, 3).forEach((callback) => callback());
  assert.equal(plays, 0);
  assert.equal(slot.musicLoading, true);
  callbacks[3]();
  assert.equal(plays, 1);
  assert.equal(slot.musicLoading, false);
});

test('liberação normal do mixer invalida metadados pendentes de fontes reais', () => {
  const runtime = { performance: { now: () => 0 }, ci: (file) => file, k8: () => 0, dw: 0.06 };
  const load = vm.runInNewContext(`({${method(corrected, 'load', 'keepInStep')}}).load`, runtime);
  const release = vm.runInNewContext(
    `({${method(corrected, 'release', 'load')}}).release`,
    runtime,
  );
  let loaded;
  let plays = 0;
  const slot = {
    owner: 7,
    shape() {},
    el: {
      src: '',
      readyState: 0,
      addEventListener(_event, callback) {
        loaded = callback;
      },
      load() {},
      play() {
        plays++;
        return Promise.resolve();
      },
      set currentTime(_value) {
        assert.fail('fonte liberada não pode buscar');
      },
    },
  };
  load.call({ net: { serverNow: () => 0 } }, slot, 'a.mp3', 'a', 0, 100);
  release(slot, 1);
  loaded();
  assert.equal(plays, 0);
  assert.equal(slot.musicLoading, false);
  assert.equal(slot.owner, 0);
});
