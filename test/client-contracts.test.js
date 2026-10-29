import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const client = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
function declaration(name) {
  const start = client.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `função real ${name} presente`);
  return client.slice(start, client.indexOf('\n}', start) + 2);
}
class Element {
  constructor(tag, ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.tag = tag;
    this.children = [];
    this.hidden = false;
    this.dataset = {};
    this.style = {};
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  contains(target) {
    return this === target || this.children.some((child) => child.contains(target));
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  replaceChildren(...children) {
    if (this.contains(this.ownerDocument?.activeElement))
      this.ownerDocument.activeElement = this.ownerDocument.body;
    this.children = [];
    this.append(...children);
  }
  setAttribute(name, value) {
    this[name] = value;
  }
  removeAttribute(name) {
    delete this[name];
  }
  querySelector(selector) {
    return (
      this.children.find((child) =>
        selector.startsWith('#')
          ? child.id === selector.slice(1)
          : selector.startsWith('.')
            ? child.className === selector.slice(1)
            : child.tag === selector,
      ) ??
      this.children.map((child) => child.querySelector?.(selector)).find(Boolean) ??
      null
    );
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
}
function payment() {
  const timers = new Map();
  let nextTimer = 0;
  const scope = vm.createContext({
    queueMicrotask,
    clearInterval: (id) => timers.delete(id),
    __localPaymentEpoch: 0,
    Rx: 0,
    Lx: 0,
    window: {
      setInterval(fn) {
        const id = ++nextTimer;
        timers.set(id, fn);
        return id;
      },
    },
    T(tag, cls, text) {
      return { tag, className: cls, textContent: text };
    },
  });
  vm.runInContext(`${declaration('Zi')}\n${declaration('l0')}`, scope);
  return { scope, timers };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test('bloco real de anúncio ref+paid confirma após montagem e exatamente uma vez, sem QR ou consulta', async () => {
  const { scope, timers } = payment();
  const confirmations = [];
  let mounted = false;
  const result = { ref: 'local-ad', status: 'paid', bids: [{ id: 'bid-1' }] };
  const box = scope.l0(result, {
    paid(value) {
      assert.equal(mounted, true);
      confirmations.push(value);
    },
    check() {
      assert.fail('compra paga não precisa consulta');
    },
  });
  mounted = true;
  assert.equal(confirmations.length, 0);
  await flush();
  assert.deepEqual(confirmations, [result]);
  assert.equal(box.textContent, 'Resgate com pontos confirmado.');
  assert.equal(timers.size, 0);
});
test('bloco pendente consulta contrato local e encerra ao confirmar; fechamento cancela resposta atrasada', async () => {
  const { scope, timers } = payment();
  let checks = 0;
  let paid = 0;
  scope.l0(
    { status: 'pending', ref: 'local-1' },
    {
      check: async (ref) => {
        assert.equal(ref, 'local-1');
        return { status: ++checks === 1 ? 'pending' : 'paid' };
      },
      paid() {
        paid++;
      },
    },
  );
  await flush();
  assert.equal(paid, 0);
  await [...timers.values()][0]();
  assert.equal(paid, 1);
  assert.equal(timers.size, 0);
  let resolve;
  scope.l0(
    { status: 'pending', ref: 'local-2' },
    {
      check: () =>
        new Promise((done) => {
          resolve = done;
        }),
      paid() {
        paid++;
      },
    },
  );
  scope.Zi();
  resolve({ status: 'paid' });
  await flush();
  assert.equal(paid, 1);
});
test('falha ou contrato incompleto de compra mostra erro explícito e encerra polling', async () => {
  const { scope, timers } = payment();
  const box = scope.l0(
    { status: 'pending', ref: 'local' },
    {
      check: async () => {
        throw new Error('offline');
      },
      paid() {
        assert.fail();
      },
    },
  );
  await flush();
  assert.match(box.textContent, /Falha ao consultar/);
  assert.equal(timers.size, 0);
  assert.match(scope.l0({ status: 'pending' }, {}).textContent, /Não foi possível confirmar/);
});
test('comparador visual real persiste troca isolada de skin e desenho e evita gravação duplicada', () => {
  const saved = [];
  const original = {
    team: 'a',
    character: 1,
    shirt: 0,
    appearance: 1,
    skin: 'skin-a',
    design: 'd1',
  };
  const scope = vm.createContext({
    cn: true,
    xt: { user: { visual: original } },
    Xu: null,
    $u: false,
    of: 0,
    clearTimeout() {},
    window: {
      setTimeout(fn) {
        fn();
        return 1;
      },
    },
    oy: (n) => saved.push(n),
  });
  vm.runInContext(declaration('ry'), scope);
  const next = { ...original, skin: 'skin-b' };
  scope.ry(next);
  scope.ry(next);
  assert.equal(saved.length, 1);
  scope.ry({ ...next, design: 'd2' });
  assert.equal(saved.length, 2);
  scope.ry({ ...next, design: null, skin: null });
  assert.equal(saved.length, 3);
});
function social() {
  const documentEvents = {},
    netEvents = {},
    messages = [];
  const document = {
    visibilityState: 'visible',
    body: {},
    createElement: (tag) => new Element(tag, document),
    addEventListener: (type, fn) => {
      documentEvents[type] = fn;
    },
  };
  document.activeElement = document.body;
  const window = { addEventListener() {} };
  const hud = new Element('div', document),
    top = new Element('div', document);
  const scope = vm.createContext({
    document,
    window,
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
  vm.runInContext(`${declaration('st')}\n${declaration('nj')}`, scope);
  scope.nj({
    hud,
    top,
    net: {
      send: (message) => messages.push({ ...message }),
      addEventListener: (type, fn) => {
        netEvents[type] = fn;
      },
    },
    active: () => true,
    toast() {},
  });
  const event = (data) => netEvents.social({ detail: data });
  const all = (el) => [el, ...el.children.flatMap((child) => all(child))];
  const button = (text) =>
    [...all(top), ...all(hud)].find((el) => el.tag === 'button' && el.textContent === text);
  return { document, documentEvents, messages, event, button, hud, top, all };
}
test('interface social real envia foco e read após renderização; aba oculta não lê e reabrir confirma nova mensagem', () => {
  const app = social();
  app.event({ a: 'hello', account: true, uid: 'me', unread: 1 });
  app.top.querySelector('#social-open').onclick();
  app.button('Mensagens').onclick();
  app.event({ a: 'inbox', threads: [{ uid: 'friend', nick: 'Amigo', unread: 1, preview: 'Olá' }] });
  app
    .all(app.hud)
    .find(
      (el) => el.tag === 'button' && el.children.some((child) => child.textContent === 'Amigo (1)'),
    )
    .onclick();
  assert.equal(app.messages.at(-2).a, 'thread_focus');
  assert.equal(app.messages.at(-2).on, true);
  assert.equal(app.messages.at(-1).a, 'thread');
  app.event({
    a: 'thread',
    uid: 'friend',
    nick: 'Amigo',
    messages: [{ id: 'm1', from: 'friend', text: 'Olá' }],
  });
  assert.equal(app.messages.at(-1).a, 'read');
  assert.equal(app.messages.at(-1).mid, 'm1');
  app.event({ a: 'hello', account: true, uid: 'me', unread: 0 });
  assert.equal(app.messages.filter((m) => m.a === 'read').length, 1);
  app.document.visibilityState = 'hidden';
  app.documentEvents.visibilitychange();
  assert.equal(app.messages.at(-1).a, 'thread_focus');
  assert.equal(app.messages.at(-1).on, false);
  app.event({ a: 'dm', id: 'm2', from: 'friend', to: 'me', text: 'Depois' });
  assert.equal(app.messages.filter((m) => m.a === 'read').length, 1);
  app.document.visibilityState = 'visible';
  app.documentEvents.visibilitychange();
  assert.equal(app.messages.at(-2).a, 'thread_focus');
  assert.equal(app.messages.at(-1).mid, 'm2');
  app.button('Voltar').onclick();
  assert.equal(app.messages.at(-1).on, false);
  app.event({
    a: 'thread',
    uid: 'friend',
    messages: [{ id: 'stale', from: 'friend', text: 'antiga' }],
  });
  assert.equal(app.messages.filter((m) => m.a === 'read').length, 2);
});

test('fechar o painel social libera foco e não confirma DM até reabrir', () => {
  const app = social();
  app.event({ a: 'hello', account: true, uid: 'me', unread: 0 });
  app.top.querySelector('#social-open').onclick();
  app.button('Mensagens').onclick();
  app.event({ a: 'inbox', threads: [{ uid: 'friend', nick: 'Amigo', unread: 0 }] });
  app
    .all(app.hud)
    .find((el) => el.tag === 'button' && el.children.some((child) => child.textContent === 'Amigo'))
    .onclick();
  app.event({
    a: 'thread',
    uid: 'friend',
    messages: [{ id: 'm1', from: 'friend', text: 'Primeira' }],
  });
  app.button('×').onclick();
  assert.equal(app.messages.at(-1).a, 'thread_focus');
  assert.equal(app.messages.at(-1).on, false);
  app.event({ a: 'dm', id: 'm2', from: 'friend', to: 'me', text: 'Enquanto fechado' });
  assert.equal(app.messages.filter((m) => m.a === 'read').length, 1);
  app.top.querySelector('#social-open').onclick();
  assert.equal(app.messages.at(-1).a, 'read');
  assert.equal(app.messages.at(-1).mid, 'm2');
});

test('snapshot real de entrada inclui desenho e skin para a persistência', () => {
  const start = client.indexOf('const s8 = () => {');
  const source = client.slice(start, client.indexOf('\n};', start) + 3);
  const scope = vm.createContext({
    Bs: () => 1,
    ir: () => ({ shirt: 0, appearance: 2, design: 'design-1' }),
    mo: {},
    jn: () => 0,
    qn: { baseCharacter: 1, key: 'skin-b' },
  });
  vm.runInContext(`${source}\nglobalThis.snapshot = s8();`, scope);
  assert.equal(scope.snapshot.skin, 'skin-b');
  assert.equal(scope.snapshot.design, 'design-1');
});
