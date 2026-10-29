import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleWorldMessage, initWorld, syncPlayerSound } from '../src/world-actions.js';
import { musicTracksForTeam } from '../src/music-catalog.js';
import {
  applySoundControlsClient,
  keepSoundPanelState,
  soundListeningHint,
} from '../scripts/sound-controls-client.js';
import vm from 'node:vm';
import { applyHudDesign } from '../scripts/design-hud.js';

function fixture(team = 0) {
  const messages = [],
    broadcasts = [];
  const player = { id: 1, team, mode: 0, x: 0, z: 0 };
  const ctx = {
    freeAccess: true,
    state: { users: [], world: {} },
    players: new Map([[1, player]]),
    save() {},
    sendPlayer(_player, message) {
      messages.push(structuredClone(message));
    },
    broadcast(message) {
      broadcasts.push(structuredClone(message));
    },
  };
  initWorld(player, ctx);
  return {
    player,
    ctx,
    messages,
    broadcasts,
    send(a, extra = {}) {
      handleWorldMessage(player, { t: 'som', a, ...extra }, ctx);
    },
    get source() {
      return ctx.localWorld.sounds.get(1);
    },
  };
}

test('som rejeita faixa inexistente ou de outro time e ignora ações desconhecidas', () => {
  const f = fixture();
  for (const track of [
    'removed',
    musicTracksForTeam(1)[0].id,
    'https://youtube.com/watch?v=anything',
  ])
    f.send('play', { track });
  f.send('unknown');
  assert.equal(f.source, undefined);
  assert.equal(f.broadcasts.length, 0);
});

test('seleção e próxima percorrem apenas o catálogo do time e voltam ao começo', () => {
  for (const team of [0, 1, 2]) {
    const f = fixture(team),
      tracks = musicTracksForTeam(team);
    f.send('play', { track: tracks.at(-1).id });
    f.send('next');
    assert.equal(f.source.track, tracks[0].id);
    f.send('stop');
    assert.equal(f.source.track, null);
    f.send('next');
    assert.equal(f.source.track, tracks[0].id);
    f.send('caixa', { on: false });
    assert.equal(f.source, undefined);
  }
});

test('veículos criam fonte com alcance/veículo reais e preservam stop ao sincronizar', () => {
  const f = fixture();
  f.player.mode = 5;
  f.player.vehicle = 100001;
  syncPlayerSound(f.player, f.ctx);
  assert.equal(f.source.item, 'carro-som');
  assert.equal(f.source.v, 100001);
  f.send('stop');
  syncPlayerSound(f.player, f.ctx);
  assert.equal(f.source.track, null);
  f.send('play', { track: musicTracksForTeam(0)[1].id });
  f.player.mode = 6;
  f.player.vehicle = 100002;
  syncPlayerSound(f.player, f.ctx);
  assert.equal(f.source.item, 'caminhao-som');
  assert.equal(f.source.v, 100002);
  assert.equal(f.source.track, musicTracksForTeam(0)[1].id);
  f.send('volume', { n: 0.4 });
  assert.equal(f.source.level, 0.4);
  f.player.mode = 0;
  f.player.vehicle = 0;
  syncPlayerSound(f.player, f.ctx);
  assert.equal(f.source, undefined);
  assert.equal(f.broadcasts.at(-1).t, 'som_off');
});

test('espectador perde fonte e mudança de time troca catálogo sem importar faixa antiga', () => {
  const f = fixture();
  f.send('play', { track: musicTracksForTeam(0)[0].id });
  f.player.team = 1;
  syncPlayerSound(f.player, f.ctx);
  assert.equal(f.source.team, 1);
  assert.equal(f.source.track, musicTracksForTeam(1)[0].id);
  f.player.spectator = true;
  syncPlayerSound(f.player, f.ctx);
  f.send('play', { track: musicTracksForTeam(1)[0].id });
  assert.equal(f.source, undefined);
});

test('mudar time no veículo inicia a nova faixa no começo com timestamp novo', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const f = fixture();
  f.player.mode = 5;
  f.player.vehicle = 100001;
  syncPlayerSound(f.player, f.ctx);
  assert.equal(f.source.at, 1000);
  t.mock.timers.tick(30000);
  f.player.team = 1;
  syncPlayerSound(f.player, f.ctx);
  assert.equal(f.source.track, musicTracksForTeam(1)[0].id);
  assert.equal(f.source.at, 31000);
});

test('patch conserva dois botões nativos e protege catálogo vazio, palco e aplicação duplicada', () => {
  const source = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const patched = applySoundControlsClient(source);
  assert.equal(patched.split('aria-label="Próxima música" ${P.stageMuted').length - 1, 2);
  assert.ok(patched.includes('Músicas disponíveis para o seu equipamento'));
  assert.ok(patched.includes('Voz dos palcos'));
  assert.ok(patched.includes('Volume das vozes dos palanques e caminhões'));
  assert.ok(patched.includes('if (B !== "stop" && (!P || P.stageMuted)) return;'));
  assert.throws(() => applySoundControlsClient(patched), /incompatível/);
});

test('escuta informa som geral, volume e preferência de voz separadamente do microfone', () => {
  const enabled = { enabled: true, debateMuted: false, voiceOn: true, voiceVolume: 1 };
  assert.match(soundListeningHint({ ...enabled, enabled: false }), /Ativar som geral/);
  assert.match(
    soundListeningHint({ ...enabled, debateMuted: true }),
    /silenciado durante o debate/,
  );
  assert.match(soundListeningHint({ ...enabled, voiceOn: false }), /Use Ouvir/);
  assert.match(soundListeningHint({ ...enabled, voiceVolume: 0 }), /volume das vozes está em zero/);
  assert.match(soundListeningHint(enabled), /Escuta dos palcos ativada/);
  assert.match(soundListeningHint(enabled), /para usar seu microfone, use Falar no palco/);
});

test('painel permite ativar som geral pelo controle canônico sem mudar preferência de voz', () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const source = applySoundControlsClient(original);
  assert.ok(source.includes('data-som-global aria-pressed="${!n.sound.enabled}"'));
  assert.ok(source.includes('n.sound.enabled,\n          n.sound.debateMuted,'));
  assert.ok(source.includes('n.sound.voiceOn,\n          n.sound.voiceVolume,'));
  const start = source.indexOf('e.querySelector("[data-som-global]").onclick');
  const end = source.indexOf('\n', start);
  assert.ok(start > 0 && end > start);
  const sound = { enabled: false, voiceOn: false, voiceVolume: 0.6 };
  const button = {};
  let rendered = 0;
  const context = vm.createContext({
    e: { querySelector: () => button },
    document: {
      querySelector(selector) {
        assert.equal(selector, '#sound');
        return {
          click() {
            sound.enabled = !sound.enabled;
          },
        };
      },
    },
    S(force) {
      assert.equal(force, true);
      rendered++;
    },
  });
  vm.runInContext(source.slice(start, end), context);
  button.onclick();
  assert.equal(sound.enabled, true);
  assert.equal(sound.voiceOn, false);
  assert.equal(sound.voiceVolume, 0.6);
  button.onclick();
  assert.equal(sound.enabled, false);
  assert.equal(rendered, 2);
});

test('controle Som geral do painel também retoma AudioContext suspenso pelo clique canônico', () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const source = applySoundControlsClient(applyHudDesign(original));
  const topButton = { setAttribute() {} };
  const panelButton = {};
  const audioContext = { state: 'suspended' };
  let resumed = 0;
  const sound = {
    enabled: false,
    toggle() {
      this.enabled = !this.enabled;
      return this.enabled;
    },
    unlock() {
      resumed++;
      audioContext.state = 'running';
      return Promise.resolve();
    },
  };
  topButton.click = () => topButton.onclick();
  const sandbox = vm.createContext({
    dn: sound,
    pe: () => topButton,
    Tt: String,
    Cn() {
      assert.fail('Não deve emitir erro de áudio');
    },
    e: { querySelector: () => panelButton },
    document: { querySelector: () => topButton },
    S() {},
  });
  const start = source.indexOf('pe("#sound").onclick =');
  const end = source.indexOf('const h2 = document.documentElement', start);
  vm.runInContext(source.slice(start, end), sandbox);
  const panelStart = source.indexOf('e.querySelector("[data-som-global]").onclick');
  vm.runInContext(source.slice(panelStart, source.indexOf('\n', panelStart)), sandbox);
  panelButton.onclick();
  assert.equal(resumed, 1);
  assert.equal(audioContext.state, 'running');
  assert.equal(sound.enabled, true);
});

test('Som geral preserva foco após renderizar mesmo com summary anônimo antes do botão', () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const source = applySoundControlsClient(original);
  const template = source.match(/<button\b[^>]*data-som-global\b[^>]*>.*?<\/button>/)?.[0];
  assert.ok(template, 'usa o botão do template gerado, incluindo seus atributos reais');
  const document = { body: {}, activeElement: null };
  const control = (tagName, id = '') => ({
    tagName,
    id,
    className: '',
    dataset: {},
    disabled: false,
    focus() {
      document.activeElement = this;
    },
  });
  const renderControls = (enabled) => {
    const html = vm.runInNewContext('`' + template + '`', { n: { sound: { enabled } } });
    const globalButton = control('BUTTON', html.match(/\bid="([^"]+)"/)?.[1] || '');
    globalButton.textContent = html.replace(/<[^>]+>/g, '');
    return [control('SUMMARY'), globalButton];
  };
  let controls = renderControls(false);
  const panel = {
    ownerDocument: document,
    hidden: false,
    scrollTop: 73,
    contains(element) {
      return controls.includes(element);
    },
    querySelectorAll(selector) {
      return selector === 'details' ? [] : controls;
    },
  };
  document.activeElement = controls[1];
  assert.equal(document.activeElement.textContent, 'Ativar som geral');
  keepSoundPanelState(panel, () => {
    controls = renderControls(true);
    document.activeElement = document.body;
    panel.scrollTop = 0;
  });
  assert.equal(document.activeElement, controls[1], 'devolve foco ao botão em vez do summary');
  assert.equal(document.activeElement.textContent, 'Silenciar som geral');
  assert.equal(panel.scrollTop, 73);
});
