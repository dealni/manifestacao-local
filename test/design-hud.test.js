import { requireServedArtifact } from './helpers/served-artifact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyHudDesign, restoreMobileHudFocus } from '../scripts/design-hud.js';

const raw = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const client = requireServedArtifact(
  raw,
  'const __skinPreviewMotion =',
  'function __hudFullscreenSync()',
);
const section = (start, end) =>
  client.slice(client.indexOf(start), client.indexOf(end, client.indexOf(start)));

test('fechar subpágina do mapa recupera menu móvel sem roubar foco de outros diálogos', () => {
  let removed = 0;
  const body = { classList: { remove: () => removed++ } };
  const internal = {};
  let restored = 0;
  let focused = 0;
  let expanded = 'true';
  const trigger = {
    focus: () => focused++,
    setAttribute(name, value) {
      assert.equal(name, 'aria-expanded');
      expanded = value;
    },
  };
  const menu = {
    active: true,
    page: 'map',
    sheet: { open: false, contains: (target) => target === internal },
    restoreMap: () => restored++,
    buttons: new Map([['menu', trigger]]),
  };
  const document = { body, activeElement: body, querySelector: () => null };
  restoreMobileHudFocus(menu, document);
  assert.equal(focused, 1);
  assert.equal(restored, 1);
  assert.equal(expanded, 'false');
  assert.equal(removed, 1);
  document.activeElement = internal;
  restoreMobileHudFocus(menu, document);
  assert.equal(focused, 2);
  document.activeElement = {};
  restoreMobileHudFocus(menu, document);
  assert.equal(focused, 2, 'foco externo é preservado');
  document.activeElement = body;
  document.querySelector = () => ({});
  restoreMobileHudFocus(menu, document);
  assert.equal(focused, 2, 'modal aberto por invoke assume seu próprio foco');
  document.querySelector = () => null;
  menu.active = false;
  restoreMobileHudFocus(menu, document);
  assert.equal(focused, 2, 'não foca navegação móvel oculta no desktop');
  menu.active = true;
  menu.sheet.open = true;
  expanded = 'true';
  const before = restored;
  const removedBefore = removed;
  restoreMobileHudFocus(menu, document);
  assert.equal(restored, before, 'evento close atrasado não move mapa de menu reaberto');
  assert.equal(expanded, 'true', 'evento antigo não anuncia menu reaberto como recolhido');
  assert.equal(removed, removedBefore, 'evento antigo preserva classe visual do menu reaberto');
});

function fullscreen({ webkit = false, fail = false, reject = false } = {}) {
  const button = {
    attrs: {},
    setAttribute(key, value) {
      this.attrs[key] = value;
    },
  };
  const events = {},
    notices = [];
  let calls = 0;
  const doc = {
    addEventListener(name, handler) {
      events[name] = handler;
    },
    [webkit ? 'webkitExitFullscreen' : 'exitFullscreen']() {
      calls++;
      assert.equal(this, doc);
      if (fail) throw new Error('recusado');
      if (reject) return Promise.reject(new Error('recusado'));
      doc[webkit ? 'webkitFullscreenElement' : 'fullscreenElement'] = null;
      events[webkit ? 'webkitfullscreenchange' : 'fullscreenchange']();
    },
  };
  const ctx = vm.createContext({
    document: doc,
    pe: () => button,
    Cn: (message) => notices.push(message),
    L4() {
      calls++;
      if (fail) throw new Error('recusado');
      if (reject) return Promise.reject(new Error('recusado'));
      doc[webkit ? 'webkitFullscreenElement' : 'fullscreenElement'] = {};
      events[webkit ? 'webkitfullscreenchange' : 'fullscreenchange']();
    },
  });
  vm.runInContext(section('function __hudFullscreenSync()', 'pe("#leave").onclick'), ctx);
  return { button, doc, events, notices, calls: () => calls };
}

test('HUD exige âncoras únicas antes de alterar o cliente', () => {
  assert.throws(() => applyHudDesign(''), /incompatível ou ambíguo/);
  assert.throws(() => applyHudDesign(client), /incompatível ou ambíguo/);
});

test('fechar Missões e Corrida devolve foco ao acionador visível do layout atual', () => {
  for (const name of ['tU', '$Y']) {
    const start = client.indexOf(`class ${name} {`);
    assert.ok(start > 0, `classe ${name} presente`);
    const constructor = client.slice(start, client.indexOf('\n  state', start));
    const listener = constructor.match(
      /this\.panel\.addEventListener\("close", \(\) => \{[^\n]+\}\)/,
    )?.[0];
    assert.ok(listener, `listener de fechamento de ${name} presente`);
    let mobile = true,
      close;
    const focused = [];
    const menu = {
      focus() {
        assert.equal(mobile, true);
        focused.push('menu');
      },
    };
    const options = {
      focus() {
        assert.equal(mobile, false);
        focused.push('options');
      },
    };
    const ctx = vm.createContext({
      panel: {
        addEventListener(event, callback) {
          assert.equal(event, 'close');
          close = callback;
        },
      },
      document: {
        body: { classList: { contains: (name) => name === 'mobile-hud' && mobile } },
        querySelector: (selector) =>
          selector === '[data-mobile=menu]' ? menu : selector === '#options' ? options : null,
      },
    });
    vm.runInContext(listener.replace('this.panel', 'panel'), ctx);
    close();
    mobile = false;
    close();
    mobile = true;
    close();
    assert.deepEqual(focused, ['menu', 'options', 'menu'], `${name} consulta o layout ao fechar`);
  }
});

for (const webkit of [false, true]) {
  test(`fullscreen ${webkit ? 'WebKit' : 'padrão'} acompanha entrada, saída e Escape externo`, async () => {
    const view = fullscreen({ webkit });
    assert.equal(view.button.attrs['aria-pressed'], 'false');
    const pending = view.button.onclick();
    assert.equal(view.calls(), 1, 'solicitação mantém ativação do usuário sem adiar a chamada');
    await pending;
    assert.equal(view.button.attrs['aria-pressed'], 'true');
    assert.equal(view.button.attrs['aria-label'], 'Sair da tela cheia');
    await view.button.onclick();
    assert.equal(view.calls(), 2);
    assert.equal(view.button.attrs['aria-pressed'], 'false');
    await view.button.onclick();
    view.doc[webkit ? 'webkitFullscreenElement' : 'fullscreenElement'] = null;
    view.events[webkit ? 'webkitfullscreenchange' : 'fullscreenchange']();
    assert.equal(view.button.attrs['aria-label'], 'Tela cheia');
  });
}

for (const exiting of [false, true])
  for (const mode of ['fail', 'reject']) {
    test(`fullscreen trata erro ${mode} ao ${exiting ? 'sair' : 'entrar'} sem alterar estado`, async () => {
      const view = fullscreen({ [mode]: true });
      if (exiting) {
        view.doc.fullscreenElement = {};
        view.events.fullscreenchange();
      }
      await view.button.onclick();
      assert.equal(view.notices.length, 1);
      assert.equal(view.button.attrs['aria-pressed'], String(exiting));
    });
  }

test('áudio comunica o estado silenciado inicial e após cada alternância', () => {
  const button = {
    attrs: {},
    setAttribute(key, value) {
      this.attrs[key] = value;
    },
  };
  const sound = {
    enabled: true,
    unlock() {},
    toggle() {
      return (this.enabled = !this.enabled);
    },
  };
  const ctx = vm.createContext({ pe: () => button, dn: sound, Tt: (value) => value });
  vm.runInContext(
    section('pe("#sound").setAttribute("aria-pressed"', 'const h2 = document.documentElement'),
    ctx,
  );
  assert.equal(button.attrs['aria-pressed'], 'false');
  button.onclick();
  assert.equal(button.attrs['aria-pressed'], 'true');
  assert.equal(button.attrs['aria-label'], 'Ativar áudio');
  button.onclick();
  assert.equal(button.attrs['aria-pressed'], 'false');
});

test('atalhos mobile copiam pressed somente para controles que têm estado', () => {
  const start = client.indexOf('  proxy(e, t) {');
  const end = client.indexOf('\n  render() {', start);
  assert.ok(start > 0 && end > start);
  const ctx = vm.createContext({
    I3: { actions: '' },
    __menuActionLabel: (source) => source.label,
    T: () => ({
      attrs: {},
      classList: { toggle() {} },
      setAttribute(key, value) {
        this.attrs[key] = value;
      },
      append() {},
    }),
  });
  vm.runInContext(`class Menu { ${client.slice(start, end)} }; globalThis.Menu = Menu;`, ctx);
  const menu = new ctx.Menu();
  let clicked = 0;
  menu.invoke = (action) => action();
  function source(pressed) {
    return {
      label: 'Sair da tela cheia',
      disabled: false,
      querySelector: () => null,
      hasAttribute: () => pressed !== null,
      getAttribute: () => pressed,
      classList: { contains: () => false },
      click() {
        clicked++;
      },
    };
  }
  const selected = menu.proxy(source('true'));
  assert.equal(selected.attrs['aria-pressed'], 'true');
  assert.equal(selected.attrs['aria-label'], 'Sair da tela cheia');
  selected.onclick();
  assert.equal(clicked, 1);
  assert.equal(menu.proxy(source('false')).attrs['aria-pressed'], 'false');
  assert.equal(menu.proxy(source(null)).attrs['aria-pressed'], undefined);
});

test('fechar conversa mobile devolve foco ao botão e não move foco externo', () => {
  const start = client.indexOf('  toggleChat(e =');
  const end = client.indexOf('\n  update() {', start);
  assert.ok(start > 0 && end > start);
  let focused = 0;
  const trigger = {
    setAttribute() {},
    focus() {
      focused++;
    },
  };
  const content = {},
    chevron = {};
  const ctx = vm.createContext({
    document: {
      body: { classList: { contains: () => true, toggle() {} } },
      activeElement: { closest: () => true },
      querySelector: (selector) =>
        selector === '#chat-content' ? content : selector === '#chat-chevron' ? chevron : trigger,
    },
  });
  vm.runInContext(`class Menu { ${client.slice(start, end)} }; globalThis.Menu = Menu;`, ctx);
  const menu = new ctx.Menu();
  Object.assign(menu, { active: true, opts: { stop() {} }, buttons: new Map([['chat', trigger]]) });
  menu.toggleChat(false);
  assert.equal(focused, 1);
  assert.equal(content.hidden, true);
  ctx.document.activeElement.closest = () => false;
  menu.toggleChat(false);
  assert.equal(focused, 1);
});

test('prévia 3D da loja congela movimento automático sem impedir redesenho, e encerra ao fechar', () => {
  const anchor = client.indexOf('const __skinPreviewMotion =');
  const start = client.indexOf('      const x = (M) => {', anchor);
  const end = client.indexOf('\n      requestAnimationFrame(x);', start);
  assert.ok(anchor > 0 && start > anchor && end > start);
  const frames = [],
    deltas = [],
    snapshots = [];
  const motion = { matches: true };
  const ctx = vm.createContext({
    __skinPreviewMotion: motion,
    l: true,
    d: 1,
    p: 1,
    e: { open: true },
    s: { key: 'skin' },
    v: 7,
    w: 0,
    n: { team: () => 1 },
    m: { set: (state) => snapshots.push(state), render: (delta) => deltas.push(delta) },
    requestAnimationFrame: (callback) => frames.push(callback),
  });
  ctx.b = ctx.s;
  vm.runInContext(`${client.slice(start, end)}; globalThis.frame = x;`, ctx);
  ctx.frame(1000);
  assert.equal(deltas.at(-1), 0);
  assert.equal(snapshots.at(-1).character, 7);
  assert.equal(frames.length, 1, 'continua redesenhando para permitir giro manual');
  motion.matches = false;
  frames.shift()(1100);
  assert.equal(deltas.at(-1), 0.05);
  motion.matches = true;
  frames.shift()(1200);
  assert.equal(deltas.at(-1), 0);
  const rendered = deltas.length;
  ctx.e.open = false;
  frames.shift()(1300);
  assert.equal(deltas.length, rendered);
  assert.equal(frames.length, 0);
});

test('fechamento atrasado de Missões e Corrida preserva diálogo reaberto ou outro modal', () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const source = applyHudDesign(original);
  for (const name of ['tU', '$Y']) {
    const start = source.indexOf(`class ${name} {`);
    const constructor = source.slice(start, source.indexOf('\n  state', start));
    const listener = constructor.match(
      /this\.panel\.addEventListener\("close", \(\) => \{[^\n]+\}\)/,
    )?.[0];
    assert.ok(listener);
    let close,
      otherModal = null,
      focused = 0;
    const panel = {
      open: false,
      addEventListener(event, callback) {
        assert.equal(event, 'close');
        close = callback;
      },
    };
    const context = vm.createContext({
      panel,
      document: {
        body: { classList: { contains: () => false } },
        querySelector: (selector) =>
          selector === 'dialog[open]'
            ? otherModal
            : {
                focus() {
                  focused++;
                },
              },
      },
    });
    vm.runInContext(listener.replaceAll('this.panel', 'panel'), context);
    panel.open = true;
    close();
    assert.equal(focused, 0, `${name} reaberto conserva seu foco`);
    panel.open = false;
    otherModal = {};
    close();
    assert.equal(focused, 0, `${name} não captura foco de outro modal`);
    otherModal = null;
    close();
    assert.equal(focused, 1, `${name} fechado devolve foco quando não existe outro modal`);
  }
});

function soundActivationContext(source, failure = '') {
  let resumes = 0;
  const notices = [];
  const button = {
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
  };
  const context = {
    state: 'suspended',
    resume() {
      resumes++;
      if (failure === 'throw') throw new Error('blocked');
      if (failure === 'reject') return Promise.reject(new Error('blocked'));
      this.state = 'running';
      return Promise.resolve();
    },
  };
  const sound = {
    enabled: false,
    voiceOn: true,
    voiceVolume: 0.7,
    toggle() {
      this.enabled = !this.enabled;
      return this.enabled;
    },
    unlock() {
      return context.resume();
    },
  };
  const sandbox = vm.createContext({
    pe: () => button,
    dn: sound,
    Tt: String,
    Cn: (message) => notices.push(message),
  });
  const start = source.indexOf('pe("#sound").onclick =');
  const end = source.indexOf('const h2 = document.documentElement', start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(source.slice(start, end), sandbox);
  return { sound, button, context, notices, resumes: () => resumes };
}

test('ativar som geral retoma contexto suspenso ainda no gesto de usuário', async () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const before = soundActivationContext(original);
  before.button.onclick();
  assert.equal(before.context.state, 'suspended', 'reproduz botão antigo ligado sem áudio');
  assert.equal(before.resumes(), 0);
  const f = soundActivationContext(applyHudDesign(original));
  const pending = f.button.onclick();
  assert.equal(f.resumes(), 1, 'resume é chamado antes de sair do clique');
  await pending;
  assert.equal(f.context.state, 'running');
  assert.equal(f.button.attrs['aria-pressed'], 'false');
  assert.equal(f.button.attrs['aria-label'], 'Silenciar áudio');
  assert.equal(f.sound.voiceOn, true);
  assert.equal(f.sound.voiceVolume, 0.7);
  await f.button.onclick();
  assert.equal(f.resumes(), 1, 'silenciar não retoma reprodução');
  assert.equal(f.button.attrs['aria-pressed'], 'true');
});

for (const failure of ['throw', 'reject']) {
  test(`ativar áudio trata falha ${failure} sem rejeição solta nem HUD incoerente`, async () => {
    const original = readFileSync(
      new URL('../analysis/client-readable.js', import.meta.url),
      'utf8',
    );
    const f = soundActivationContext(applyHudDesign(original), failure);
    await f.button.onclick();
    assert.equal(f.notices.length, 1);
    assert.match(f.notices[0], /Não foi possível ativar o áudio/);
    assert.equal(f.sound.enabled, true, 'a preferência permanece ligada para nova tentativa');
    assert.equal(f.button.attrs['aria-pressed'], 'false');
    assert.equal(f.context.state, 'suspended');
  });
}
