import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import babel from 'prettier/plugins/babel';

// Exercita os patches reais do gerador em memória, sem regenerar public/client.js.
const original = fs.readFileSync(
  new URL('../analysis/client-readable.js', import.meta.url),
  'utf8',
);
const generator = fs.readFileSync(new URL('../scripts/prepare-client.js', import.meta.url), 'utf8');
const patches = babel.parsers.babel
  .parse(generator)
  .program.body.filter(
    (node) =>
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee.name === 'patch',
  )
  .map((node) => node.expression.arguments)
  .filter((args) =>
    [
      'foco social e confirmação explícita de leitura',
      'fechar foco social',
      'sincronizar conversa renderizada',
      'confirmar leitura após renderização',
      'abrir foco antes de carregar mensagens',
      'contar mensagens em conversa oculta',
      'descartar resposta de conversa anterior',
      'sincronizar contador confirmado',
    ].includes(args[0].value),
  );
function declaration(name) {
  const start = original.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  return original.slice(start, original.indexOf('\n}', start) + 2);
}
let socialSource = declaration('nj');
for (const [, before, after] of patches) {
  const literal = (node) => vm.runInNewContext(generator.slice(node.start, node.end));
  const needle = literal(before);
  assert.equal(socialSource.indexOf(needle), socialSource.lastIndexOf(needle));
  assert.ok(socialSource.includes(needle));
  socialSource = socialSource.replace(needle, literal(after));
}
assert.equal(patches.length, 8);

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.hidden = false;
    this.dataset = {};
    this.style = {};
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }
  setAttribute(name, value) {
    this[name] = value;
  }
  querySelector(selector) {
    return (
      this.children.find((child) =>
        selector.startsWith('#') ? child.id === selector.slice(1) : child.tag === selector,
      ) ??
      this.children.map((child) => child.querySelector?.(selector)).find(Boolean) ??
      null
    );
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
}
function fixture() {
  const events = {},
    messages = [],
    documentEvents = {};
  const document = {
    visibilityState: 'visible',
    createElement: (tag) => new Element(tag),
    addEventListener: (type, fn) => {
      documentEvents[type] = fn;
    },
  };
  const hud = new Element('div'),
    top = new Element('div');
  const scope = vm.createContext({
    document,
    window: { addEventListener() {} },
    tj: '',
    q3: 'Conta necessária',
    innerWidth: 1000,
    innerHeight: 800,
    ej: class {
      constructor() {
        this.on = false;
      }
    },
  });
  vm.runInContext(`${declaration('st')}\n${socialSource}`, scope);
  scope.nj({
    hud,
    top,
    net: {
      send: (message) => messages.push({ ...message }),
      addEventListener: (type, fn) => {
        events[type] = fn;
      },
    },
    active: () => true,
    toast() {},
  });
  const all = (el) => [el, ...el.children.flatMap(all)];
  const button = (text) =>
    [...all(top), ...all(hud)].find((el) => el.tag === 'button' && el.textContent === text);
  const event = (data) => events.social({ detail: data });
  const hello = () => event({ a: 'hello', account: true, uid: 'me', unread: 0 });
  hello();
  top.querySelector('#social-open').onclick();
  button('Mensagens').onclick();
  event({ a: 'inbox', threads: [{ uid: 'friend', nick: 'Amigo', unread: 0 }] });
  all(hud)
    .find((el) => el.tag === 'button' && el.children.some((child) => child.textContent === 'Amigo'))
    .onclick();
  event({ a: 'thread', uid: 'friend', messages: [{ id: 'm1', from: 'friend', text: 'Primeira' }] });
  messages.length = 0;
  return {
    messages,
    event,
    hello,
    button,
    top,
    document,
    reconnect: () => events.welcome({ detail: {} }),
    visibility: (value) => {
      document.visibilityState = value;
      documentEvents.visibilitychange();
    },
  };
}

test('reconexão restaura foco antes do ACK na conversa visível e não repete ACK no hello de leitura', () => {
  const app = fixture();
  app.reconnect();
  assert.deepEqual(app.messages, []);
  app.hello();
  assert.deepEqual(app.messages, [
    { t: 'social', a: 'thread_focus', uid: 'friend', on: true },
    { t: 'social', a: 'read', uid: 'friend', mid: 'm1' },
  ]);
  app.messages.length = 0;
  app.hello();
  assert.deepEqual(app.messages, []);
  app.event({ a: 'dm', id: 'm2', from: 'friend', to: 'me', text: 'Nova' });
  assert.deepEqual(app.messages, [{ t: 'social', a: 'read', uid: 'friend', mid: 'm2' }]);
  app.hello();
  assert.equal(app.messages.length, 1);
});

test('reconexão com aba oculta aguarda visibilidade para restaurar foco e confirmar DM', () => {
  const app = fixture();
  app.visibility('hidden');
  app.messages.length = 0;
  app.reconnect();
  app.hello();
  app.event({ a: 'dm', id: 'm2', from: 'friend', to: 'me', text: 'Enquanto oculta' });
  assert.deepEqual(app.messages, []);
  app.visibility('visible');
  assert.deepEqual(app.messages, [
    { t: 'social', a: 'thread_focus', uid: 'friend', on: true },
    { t: 'social', a: 'read', uid: 'friend', mid: 'm2' },
  ]);
});

test('reconexão com painel fechado aguarda reabertura e hello sem conta não confirma DM', () => {
  const app = fixture();
  app.button('×').onclick();
  app.messages.length = 0;
  app.reconnect();
  app.hello();
  app.event({ a: 'dm', id: 'm2', from: 'friend', to: 'me', text: 'Enquanto fechado' });
  assert.deepEqual(app.messages, []);
  app.top.querySelector('#social-open').onclick();
  assert.deepEqual(app.messages, [
    { t: 'social', a: 'inbox' },
    { t: 'social', a: 'thread_focus', uid: 'friend', on: true },
    { t: 'social', a: 'read', uid: 'friend', mid: 'm2' },
  ]);
  app.messages.length = 0;
  app.reconnect();
  app.event({ a: 'hello', account: false, uid: '', unread: 0 });
  assert.deepEqual(app.messages, []);
});
