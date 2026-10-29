import { requireServedArtifact } from './helpers/served-artifact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installCleanDesktop, applyCleanDesktop } from '../scripts/hud-clean-desktop.js';

class Element {
  constructor(document) {
    this.document = document;
    this.children = [];
    this.attributes = {};
    this.hidden = false;
    this.events = {};
    const classes = new Set();
    this.classList = {
      toggle(name, value) {
        value ? classes.add(name) : classes.delete(name);
      },
      contains: (name) => classes.has(name),
    };
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  addEventListener(name, callback) {
    (this.events[name] ||= []).push(callback);
  }
  append(...items) {
    for (const item of items) {
      this.children.push(item);
      item.parent = this;
    }
  }
  prepend(item) {
    this.children.unshift(item);
    item.parent = this;
  }
  before(item) {
    const siblings = this.parent.children;
    siblings.splice(siblings.indexOf(this), 0, item);
    item.parent = this.parent;
  }
  contains(element) {
    return element === this || this.children.some((child) => child.contains(element));
  }
  focus() {
    this.document.activeElement = this;
  }
  querySelectorAll() {
    return this.popovers ?? [];
  }
  click() {
    this.onclick?.();
    for (const listener of this.events.click ?? []) listener();
  }
}

function fixture({ saved = {}, unavailable = false, mobile = false } = {}) {
  const listeners = [];
  const media = {
    matches: mobile,
    addEventListener(event, listener) {
      listeners.push(listener);
    },
  };
  const memory = new Map(Object.entries(saved));
  const storage = {
    getItem(key) {
      if (unavailable) throw new Error('indisponível');
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      if (unavailable) throw new Error('indisponível');
      memory.set(key, value);
    },
  };
  const document = {
    defaultView: { localStorage: storage },
    createElement() {
      return new Element(this);
    },
  };
  const elements = Object.fromEntries(
    [
      '#chat-content',
      '#chat-toggle',
      '#chat-chevron',
      '.map-panel',
      '.dock',
      '.action-area',
      '[data-mobile=menu]',
    ].map((key) => [key, document.createElement()]),
  );
  const [chat, chatToggle, chevron, map, dock, area] = Object.values(elements);
  document.querySelector = (selector) => elements[selector];
  area.append(dock);
  map.append(document.createElement(), document.createElement(), document.createElement());
  const input = document.createElement();
  chat.append(input);
  chatToggle.onclick = () => {
    chat.hidden = !chat.hidden;
  };
  // Listener legado MH.layout é registrado primeiro e reabre a conversa ao voltar ao desktop.
  listeners.push(() => {
    chat.hidden = mobile ? false : !media.matches ? false : chat.hidden;
  });
  const hud = installCleanDesktop({ document, media });
  const mapToggle = map.children[0];
  const dockToggle = area.children[0];
  return {
    hud,
    document,
    chat,
    chatToggle,
    chevron,
    map,
    dock,
    area,
    input,
    mapToggle,
    dockToggle,
    memory,
    changeMobile(value) {
      media.matches = value;
      for (const listener of listeners) listener();
    },
  };
}

const prefix = 'manifestacoes.hud.desktop.';
test('chat, mapa e ações começam recolhidos e reabrem sem recriar conteúdo ou remover funções', () => {
  const f = fixture();
  const originalMap = f.map.children.slice(1);
  assert.equal(f.chat.hidden, true);
  assert.equal(f.dock.hidden, true);
  assert.equal(f.mapToggle.attributes['aria-expanded'], 'false');
  assert.ok(originalMap.every((child) => child.hidden));
  f.mapToggle.click();
  f.dockToggle.click();
  f.chatToggle.click();
  assert.equal(f.chat.hidden, false);
  assert.equal(f.dock.hidden, false);
  assert.ok(originalMap.every((child) => !child.hidden));
  assert.deepEqual(f.map.children.slice(1), originalMap);
  assert.equal(f.input.parent, f.chat);
  assert.equal(f.memory.get(prefix + 'chat.v1'), 'open');
  assert.equal(f.memory.get(prefix + 'map.v1'), 'open');
  assert.equal(f.memory.get(prefix + 'actions.v1'), 'open');
});

test('preferências abertas persistem após recarga e fechadas também sobrevivem a recarga', () => {
  const initial = fixture({
    saved: {
      [prefix + 'chat.v1']: 'open',
      [prefix + 'map.v1']: 'open',
      [prefix + 'actions.v1']: 'open',
    },
  });
  assert.equal(initial.chat.hidden, false);
  assert.equal(initial.dock.hidden, false);
  initial.chatToggle.click();
  initial.mapToggle.click();
  initial.dockToggle.click();
  const reloaded = fixture({ saved: Object.fromEntries(initial.memory) });
  assert.equal(reloaded.chat.hidden, true);
  assert.equal(reloaded.dock.hidden, true);
  assert.equal(reloaded.mapToggle.attributes['aria-expanded'], 'false');
});

test('altura antiga ou valor inválido não abre painéis; armazenamento bloqueado mantém controles funcionais', () => {
  const bad = fixture({
    saved: { 'paulista.chat-height.v1': '320', [prefix + 'chat.v1']: 'true' },
  });
  assert.equal(bad.chat.hidden, true);
  const f = fixture({ unavailable: true });
  f.chatToggle.click();
  f.dockToggle.click();
  f.changeMobile(true);
  f.changeMobile(false);
  assert.equal(f.chat.hidden, false);
  assert.equal(f.dock.hidden, false);
  f.chatToggle.click();
  f.dockToggle.click();
  f.changeMobile(true);
  f.changeMobile(false);
  assert.equal(f.chat.hidden, true);
  assert.equal(f.dock.hidden, true);
});

test('mobile preserva layout próprio e escolhas do desktop sobrevivem à troca de dispositivo', () => {
  const f = fixture();
  f.changeMobile(true);
  assert.equal(f.mapToggle.hidden, true);
  assert.equal(f.dockToggle.hidden, true);
  assert.equal(f.dock.hidden, false);
  assert.ok(f.map.children.slice(1).every((child) => !child.hidden));
  f.chatToggle.click();
  assert.equal(f.memory.has(prefix + 'chat.v1'), false);
  f.changeMobile(false);
  assert.equal(f.chat.hidden, true, 'MH.layout reabre, mas a preferência desktop prevalece');
  assert.equal(f.dock.hidden, true);
  f.hud.openChat();
  assert.equal(f.chat.hidden, false);
  assert.equal(f.chatToggle.getAttribute('aria-expanded'), 'true');
  assert.equal(f.chevron.textContent, '−');
});

test('recolher devolve foco ao acionador e fecha popover aberto antes de esconder dock', () => {
  const f = fixture();
  f.dockToggle.click();
  const action = f.document.createElement();
  f.dock.append(action);
  let closed = 0;
  f.dock.popovers = [
    {
      hidePopover() {
        closed++;
      },
    },
  ];
  action.focus();
  f.dockToggle.click();
  assert.equal(f.document.activeElement, f.dockToggle);
  assert.equal(closed, 1);
  assert.equal(f.dock.hidden, true);
  f.hud.openChat();
  f.input.focus();
  f.hud.set('chat', false);
  assert.equal(f.document.activeElement, f.chatToggle);
});

test('trocar layout devolve foco visível quando o painel desktop começa recolhido', () => {
  for (const panel of ['map', 'dock', 'chat']) {
    const f = fixture();
    f.changeMobile(true);
    const content = panel === 'chat' ? f.input : f.document.createElement();
    if (panel !== 'chat') f[panel].append(content);
    // O canvas já existente pertence aos filhos controlados pelo mapa.
    const target = panel === 'map' ? f.map.children[1] : content;
    target.focus();
    f.changeMobile(false);
    assert.equal(f.document.activeElement, f[panel === 'chat' ? 'chatToggle' : `${panel}Toggle`]);
  }
});

test('atalhos exclusivos do desktop devolvem foco ao menu móvel ao mudar layout', () => {
  for (const name of ['mapToggle', 'dockToggle']) {
    const f = fixture();
    f[name].focus();
    f.changeMobile(true);
    assert.equal(f.document.activeElement, f.document.querySelector('[data-mobile=menu]'));
    assert.equal(f[name].hidden, true);
  }
});

test('voltar ao desktop recolhido fecha popovers móveis antes de ocultar dock', () => {
  const f = fixture();
  f.changeMobile(true);
  let closed = 0;
  f.dock.popovers = [
    {
      hidePopover() {
        assert.equal(f.dock.hidden, false, 'popover fecha antes do ancestral');
        closed++;
      },
    },
  ];
  f.changeMobile(false);
  assert.equal(closed, 1);
  assert.equal(f.dock.hidden, true);
  f.changeMobile(true);
  assert.equal(closed, 1, 'o retorno ao mobile não reabre o popover');
});

test('trocar layout preserva foco externo ou em painel desktop que permanece aberto', () => {
  const f = fixture({ saved: { [prefix + 'map.v1']: 'open' } });
  f.changeMobile(true);
  const mapContent = f.map.children[1];
  mapContent.focus();
  f.changeMobile(false);
  assert.equal(f.document.activeElement, mapContent);
  const external = f.document.createElement();
  external.focus();
  f.changeMobile(true);
  f.changeMobile(false);
  assert.equal(f.document.activeElement, external);
});

test('gerador exige âncoras únicas e Enter abre a conversa antes do foco', () => {
  const raw = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  const patched = requireServedArtifact(raw, 'const __cleanDesktopHud =');
  assert.match(
    patched,
    /if \(!Hr\?\.active\) __cleanDesktopHud.openChat\(\);\n {4}pe\("#chat-input"\).focus\(\);/,
  );
  assert.throws(() => applyCleanDesktop(''), /incompatível ou ambíguo/);
  assert.throws(() => applyCleanDesktop(patched), /incompatível ou ambíguo/);
});
