import { requireServedArtifact } from './helpers/served-artifact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { applySocialDesign } from '../scripts/design-social.js';
const raw = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const source = requireServedArtifact(raw, 'const __socialTyping =');
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
      constructor() {
        this.on = false;
      }
    },
  });
  vm.runInContext(`${declaration('st')}\n${declaration('nj')}`, context);
  const social = context.nj({
    hud,
    top,
    active: () => true,
    toast() {},
    net: {
      send: (message) => sent.push({ ...message }),
      addEventListener: (type, fn) => {
        events[type] = fn;
      },
    },
    pick: () => 'friend',
    self: () => 'me',
  });
  const all = () => [...hud.all(), ...top.all()];
  const button = (label) =>
    all().find((node) => node.tag === 'button' && node.textContent === label);
  const event = (payload) => events.social({ detail: payload });
  event({ a: 'hello', account: true, uid: 'me' });
  return {
    doc,
    hud,
    top,
    sent,
    social,
    keys,
    button,
    event,
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
test('patch social exige âncoras únicas e não aceita aplicação duplicada', () => {
  assert.throws(() => applySocialDesign(''), /incompatível/);
  assert.throws(() => applySocialDesign(source), /incompatível|ambíguo/);
});
test('seções e ações usam grupos de botões sem fingir tabs ou menu ARIA', () => {
  const app = fixture();
  const tabs = app.all().find((node) => node.className === 'social-tabs');
  assert.equal(tabs.role, 'group');
  assert.equal(tabs['aria-label'], 'Seções sociais');
  assert.equal(app.hud.querySelector('#social-person').role, 'group');
  app.open();
  app.button('Bloqueios').onclick();
  assert.equal(app.button('Bloqueios')['aria-pressed'], 'true');
  assert.equal(app.button('Amigos')['aria-pressed'], 'false');
});
test('abrir foca título e fechar devolve foco; Escape não captura foco de outro diálogo', () => {
  const app = fixture();
  app.open();
  assert.equal(app.doc.activeElement.tag, 'h2');
  app.button('×').onclick();
  assert.equal(app.doc.activeElement.id, 'social-open');
  app.open();
  const external = {};
  app.doc.activeElement = external;
  app.keys.keydown({ key: 'Escape' });
  assert.equal(app.doc.activeElement, external);
});
test('busca sem resultados oferece feedback e permanece distinta da lista de amigos', () => {
  const app = fixture();
  app.open();
  app.event({ a: 'found', people: [] });
  assert.ok(
    app
      .all()
      .some(
        (node) => node.role === 'status' && node.textContent.includes('Nenhuma pessoa encontrada'),
      ),
  );
  assert.ok(app.all().some((node) => node.textContent?.includes('Você ainda não tem amigos')));
});
test('DM recebida mantém rascunho, foco e seleção e confirma somente leitura real', () => {
  const app = fixture();
  app.open();
  app.openThread();
  const input = app.compose();
  input.value = 'Minha resposta';
  input.oninput();
  input.focus();
  input.setSelectionRange(2, 6);
  app.sent.length = 0;
  app.event({ a: 'dm', id: '2', from: 'friend', to: 'me', text: 'Nova' });
  assert.equal(app.doc.activeElement, app.compose());
  assert.equal(app.compose().value, 'Minha resposta');
  assert.equal(app.compose().selectionStart, 2);
  assert.equal(app.compose().selectionEnd, 6);
  assert.deepEqual(app.sent, [{ t: 'social', a: 'read', uid: 'friend', mid: '2' }]);
});
test('trocar de destinatário não transporta rascunho privado', () => {
  const app = fixture();
  app.open();
  app.openThread();
  const input = app.compose();
  input.value = 'Só para friend';
  input.oninput();
  app.openThread('other');
  assert.equal(app.compose().value, '');
});
test('mensagem pelo menu de pessoa abre painel e conversa', () => {
  const app = fixture();
  app.social.worldTap(5, 5);
  app.event({ a: 'who', id: 'friend', uid: 'friend', nick: 'Amigo', rel: 'friend' });
  app.button('Mensagem').onclick();
  assert.equal(app.hud.querySelector('#social-panel').hidden, false);
  assert.equal(app.button('Mensagens')['aria-pressed'], 'true');
  assert.ok(app.sent.some((message) => message.a === 'thread' && message.uid === 'friend'));
});
test('enviar DM vazia não envia; texto vai só para fixture e é limpo', () => {
  const app = fixture();
  app.open();
  app.openThread();
  app.sent.length = 0;
  const input = app.compose();
  input.value = '  ';
  input.parent.onsubmit({ preventDefault() {} });
  assert.deepEqual(app.sent, []);
  input.value = ' Olá ';
  input.parent.onsubmit({ preventDefault() {} });
  assert.deepEqual(app.sent, [{ t: 'social', a: 'dm', uid: 'friend', text: 'Olá' }]);
  assert.equal(input.value, '');
});
test('pedidos, bloqueios e denúncias emitem apenas o identificador da fixture selecionada', () => {
  const app = fixture();
  app.open();
  app.button('Pedidos').onclick();
  app.event({
    a: 'requests',
    people: [{ uid: 'incoming', nick: 'Recebido' }],
    outgoing: [{ uid: 'outgoing', nick: 'Enviado' }],
  });
  app.sent.length = 0;
  app.button('Aceitar').onclick();
  app.button('Recusar').onclick();
  app.button('Cancelar').onclick();
  assert.deepEqual(
    app.sent.map((message) => [message.a, message.uid]),
    [
      ['accept', 'incoming'],
      ['decline', 'incoming'],
      ['cancel', 'outgoing'],
    ],
  );
  app.button('Bloqueios').onclick();
  app.event({ a: 'blocked', people: [{ uid: 'blocked', nick: 'Bloqueado' }] });
  app.button('Desbloquear').onclick();
  assert.equal(app.sent.at(-1).uid, 'blocked');
  app.openThread();
  app.button('Denunciar').onclick();
  assert.deepEqual(app.sent.at(-1), { t: 'social', a: 'report', mid: '1' });
  assert.equal(app.button('Denunciar').disabled, true);
});
test('conta visitante recebe instrução e não renderiza contatos privados', () => {
  const app = fixture();
  app.open();
  app.openThread();
  app.event({ a: 'hello', account: false, uid: '' });
  assert.equal(app.compose(), null);
  assert.ok(
    app
      .all()
      .some(
        (node) =>
          node.className === 'social-guest' &&
          !node.hidden &&
          node.textContent === 'Conta necessária',
      ),
  );
});
