import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import babel from 'prettier/plugins/babel';
import { applySocialDesign } from '../scripts/design-social.js';

// Testa a fonte editável sem regenerar ou depender do artefato servido.
const original = fs.readFileSync(
  new URL('../analysis/client-readable.js', import.meta.url),
  'utf8',
);
const generator = fs.readFileSync(new URL('../scripts/prepare-client.js', import.meta.url), 'utf8');
let patched = original;
const labels = new Set([
  'foco social e confirmação explícita de leitura',
  'fechar foco social',
  'sincronizar conversa renderizada',
  'confirmar leitura após renderização',
  'abrir foco antes de carregar mensagens',
  'contar mensagens em conversa oculta',
  'descartar resposta de conversa anterior',
  'sincronizar contador confirmado',
]);
for (const node of babel.parsers.babel.parse(generator).program.body) {
  if (
    node.type !== 'ExpressionStatement' ||
    node.expression.type !== 'CallExpression' ||
    node.expression.callee.name !== 'patch'
  )
    continue;
  const [label, before, after] = node.expression.arguments;
  if (!labels.has(label.value)) continue;
  const literal = (item) => vm.runInNewContext(generator.slice(item.start, item.end));
  const needle = literal(before);
  assert.ok(patched.includes(needle));
  patched = patched.replace(needle, literal(after));
}
const source = applySocialDesign(patched);
function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
function fixture() {
  const events = {},
    keys = {},
    sent = [];
  const doc = {
    visibilityState: 'visible',
    body: {},
    addEventListener(type, fn) {
      keys[type] = fn;
    },
  };
  class El {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.hidden = false;
      this.dataset = {};
      this.style = {};
      this.value = '';
      this.selectionStart = 0;
      this.selectionEnd = 0;
    }
    append(...nodes) {
      nodes.forEach((node) => {
        node.parent = this;
        this.children.push(node);
      });
    }
    contains(target) {
      return this === target || this.children.some((child) => child.contains(target));
    }
    replaceChildren(...nodes) {
      if (this.contains(doc.activeElement)) doc.activeElement = doc.body;
      this.children = [];
      this.append(...nodes);
    }
    setAttribute(key, value) {
      this[key] = value;
    }
    removeAttribute(name) {
      delete this[name];
    }
    focus() {
      doc.activeElement = this;
    }
    setSelectionRange(a, b) {
      this.selectionStart = a;
      this.selectionEnd = b;
    }
    querySelector(selector) {
      if (selector === '.social-compose input')
        return (
          this.all().find(
            (node) => node.tag === 'input' && node.parent?.className === 'social-compose',
          ) ?? null
        );
      return (
        this.all()
          .slice(1)
          .find((node) =>
            selector.startsWith('#') ? node.id === selector.slice(1) : node.tag === selector,
          ) ?? null
      );
    }
    all() {
      return [this, ...this.children.flatMap((node) => node.all())];
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this);
    }
  }
  doc.createElement = (tag) => new El(tag);
  doc.activeElement = doc.body;
  const hud = new El('div'),
    top = new El('div');
  const context = vm.createContext({
    document: doc,
    window: { addEventListener() {} },
    tj: '',
    q3: 'Conta necessária',
    innerWidth: 1000,
    innerHeight: 800,
    ej: class {
      stop() {}
      constructor() {
        this.on = false;
      }
    },
  });
  vm.runInContext(`${declaration('st')}\n${declaration('nj')}`, context);
  const net = {
    connected: true,
    send: (message) => sent.push({ ...message }),
    addEventListener: (type, fn) => {
      events[type] = fn;
    },
  };
  const notices = [];
  let picked = 'friend';
  let playing = true;
  const social = context.nj({
    hud,
    top,
    active: () => playing,
    toast: (message) => notices.push(message),
    net,
    pick: () => picked,
    self: () => 'me',
  });
  const all = () => [...hud.all(), ...top.all()];
  const button = (label) =>
    all().find((node) => node.tag === 'button' && node.textContent === label);
  const event = (payload) => events.social({ detail: payload });
  event({ a: 'hello', account: true, uid: 'me' });
  return {
    doc,
    net,
    notices,
    hud,
    top,
    sent,
    social,
    keys,
    button,
    event,
    dispatch: (type, detail) => events[type]({ detail }),
    pick: (id) => {
      picked = id;
    },
    playing: (on) => {
      playing = on;
    },
    all,
    open: () => top.querySelector('#social-open').onclick(),
    compose: () => hud.querySelector('.social-compose input'),
    openThread(uid = 'friend') {
      button('Mensagens').onclick();
      event({ a: 'inbox', threads: [{ uid, nick: uid }] });
      all()
        .find(
          (node) =>
            node.tag === 'button' && node.children.some((child) => child.textContent === uid),
        )
        .onclick();
      event({ a: 'thread', uid, messages: [{ id: '1', from: uid, text: 'Olá' }] });
    },
  };
}

test('troca de conta elimina contatos, destinatário, histórico e rascunho privados', () => {
  const app = fixture();
  app.open();
  app.openThread();
  const input = app.compose();
  input.value = 'Privado da primeira conta';
  input.oninput();
  app.event({ a: 'hello', account: true, uid: 'other-account' });
  assert.equal(app.compose(), null);
  assert.ok(!app.all().some((node) => node.textContent === 'Olá'));
  app.button('Mensagens').onclick();
  assert.ok(!app.all().some((node) => node.textContent === 'friend'));
  app.openThread();
  assert.equal(app.compose().value, '');
});

test('logout com painel fechado remove contexto de pessoa, grupo e busca privados', () => {
  const app = fixture();
  app.open();
  app.event({ a: 'found', people: [{ uid: 'secret', nick: 'Contato privado' }] });
  app.event({ a: 'voice_invite', room: 'private-room', nick: 'Grupo privado' });
  app.social.worldTap(5, 5);
  app.event({ a: 'who', id: 'friend', uid: 'friend', nick: 'Amigo privado', rel: 'friend' });
  app.button('×').onclick();
  app.event({ a: 'guest' });
  assert.equal(app.hud.querySelector('#social-person').hidden, true);
  assert.equal(app.hud.querySelector('#social-call').hidden, true);
  app.event({ a: 'hello', account: true, uid: 'other-account' });
  app.open();
  assert.ok(
    !app.all().some((node) => ['Contato privado', 'Amigo privado'].includes(node.textContent)),
  );
});

test('hello da mesma conta conserva conversa e rascunho durante reconexão', () => {
  const app = fixture();
  app.open();
  app.openThread();
  app.compose().value = 'Continuar escrevendo';
  app.compose().oninput();
  app.event({ a: 'hello', account: true, uid: 'me' });
  assert.equal(app.compose().value, 'Continuar escrevendo');
  assert.ok(app.all().some((node) => node.textContent === 'Olá'));
});

test('resultado de busca tardio respeita fechamento, seção atual e saída da partida', () => {
  for (const dismiss of [
    (app) => app.button('×').onclick(),
    (app) => app.button('Mensagens').onclick(),
    (app) => app.playing(false),
  ]) {
    const app = fixture();
    app.open();
    dismiss(app);
    const hidden = app.hud.querySelector('#social-panel').hidden;
    const inboxPressed = app.button('Mensagens')['aria-pressed'];
    app.event({ a: 'found', people: [{ uid: 'late', nick: 'Resultado tardio' }] });
    assert.equal(app.hud.querySelector('#social-panel').hidden, hidden);
    assert.ok(!app.all().some((node) => node.textContent === 'Resultado tardio'));
    assert.equal(app.button('Mensagens')['aria-pressed'], inboxPressed);
  }
});

test('respostas privadas após logout não recuperam histórico nem convites antigos', () => {
  const app = fixture();
  app.open();
  app.event({ a: 'guest' });
  app.event({ a: 'found', people: [{ uid: 'secret', nick: 'Privado tardio' }] });
  app.event({ a: 'friends', people: [{ uid: 'secret', nick: 'Privado tardio' }] });
  app.event({ a: 'voice_invite', room: 'secret', nick: 'Privado tardio' });
  assert.equal(app.all().find((node) => node.className === 'social-invite').hidden, true);
  assert.equal(app.hud.querySelector('#social-call').hidden, true);
  app.event({ a: 'hello', account: true, uid: 'new' });
  assert.ok(!app.all().some((node) => node.textContent?.includes('Privado tardio')));
});

test('troca de destinatário descarta cursor da conversa anterior antes de carregar histórico', () => {
  const app = fixture();
  app.open();
  app.openThread();
  app.event({ a: 'thread', uid: 'friend', messages: [], next: 'cursor-friend' });
  assert.ok(app.button('Mensagens anteriores'));
  app.button('Mensagens').onclick();
  app.event({ a: 'inbox', threads: [{ uid: 'other', nick: 'Outro' }] });
  app
    .all()
    .find(
      (node) =>
        node.tag === 'button' && node.children.some((child) => child.textContent === 'Outro'),
    )
    .onclick();
  assert.equal(app.button('Mensagens anteriores'), undefined);
  app.event({ a: 'thread', uid: 'other', messages: [], next: 'cursor-other' });
  app.button('Mensagens anteriores').onclick();
  assert.deepEqual(app.sent.at(-1), {
    t: 'social',
    a: 'thread',
    uid: 'other',
    before: 'cursor-other',
  });
});

test('envio durante queda de conexão conserva rascunho e permite enviar após reconectar', () => {
  const app = fixture();
  app.open();
  app.openThread();
  const input = app.compose();
  input.value = 'Não perder esta mensagem';
  input.oninput();
  app.net.connected = false;
  app.sent.length = 0;
  input.parent.onsubmit({ preventDefault() {} });
  assert.equal(input.value, 'Não perder esta mensagem');
  assert.deepEqual(app.sent, []);
  assert.match(app.notices.at(-1), /reconectar/);
  app.event({ a: 'hello', account: true, uid: 'me' });
  assert.equal(app.compose().value, 'Não perder esta mensagem');
  app.net.connected = true;
  app.compose().parent.onsubmit({ preventDefault() {} });
  assert.deepEqual(app.sent.at(-1), {
    t: 'social',
    a: 'dm',
    uid: 'friend',
    text: 'Não perder esta mensagem',
  });
  assert.equal(app.compose().value, '');
});

test('menu de pessoa ignora respostas anteriores e usa somente a seleção atual', () => {
  const app = fixture();
  const menu = app.hud.querySelector('#social-person');
  app.social.worldTap(5, 5);
  app.pick('other');
  app.social.worldTap(20, 20);
  app.event({ a: 'who', id: 'friend', uid: 'friend', nick: 'Anterior', rel: 'friend' });
  assert.equal(menu.hidden, true);
  app.event({ a: 'who', id: 'other', uid: 'other', nick: 'Atual', rel: 'friend' });
  assert.equal(menu.hidden, false);
  assert.ok(menu.all().some((node) => node.textContent === 'Atual'));
});

test('fechar, tocar no vazio, desconectar ou sair invalida a abertura pendente da pessoa', () => {
  for (const dismiss of [
    (app) => app.keys.keydown({ key: 'Escape' }),
    (app) => app.keys.pointerdown({ target: app.doc.body }),
    (app) => {
      app.pick(null);
      app.social.worldTap(10, 10);
    },
    (app) => app.dispatch('connection', { connected: false }),
    (app) => app.dispatch('leave'),
    (app) => {
      app.doc.visibilityState = 'hidden';
      app.keys.visibilitychange();
    },
    (app) => app.event({ a: 'guest' }),
    (app) => app.playing(false),
  ]) {
    const app = fixture();
    app.social.worldTap(5, 5);
    dismiss(app);
    app.event({ a: 'who', id: 'friend', uid: 'friend', nick: 'Tardia', rel: 'friend' });
    assert.equal(app.hud.querySelector('#social-person').hidden, true);
  }
});
