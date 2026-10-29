import { requireServedArtifact } from './helpers/served-artifact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import babel from 'prettier/plugins/babel';
import { applyAuthDesign } from '../scripts/design-auth.js';

const source = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const client = requireServedArtifact(source, 'const __signOutStatus =');
const ast = babel.parsers.babel.parse(client);
function declaration(name) {
  const node = ast.program.body.find(
    (node) => node.type === 'FunctionDeclaration' && node.id.name === name,
  );
  assert.ok(node, name);
  return client.slice(node.start, node.end);
}
function element(tag, _className, textContent = '') {
  return {
    tag,
    textContent,
    children: [],
    attrs: {},
    disabled: false,
    append(...children) {
      this.children.push(...children);
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
  };
}

test('patch de conta é assertivo, mantém autoria reproduzível e texto de apelido corresponde ao servidor', () => {
  assert.throws(() => applyAuthDesign(''), /incompatível/);
  assert.throws(() => applyAuthDesign(client), /incompatível/);
  assert.match(client, /Com conta, o novo apelido também fica salvo para a próxima entrada/);
  assert.doesNotMatch(client, /a conta ainda guarda o antigo/);
});

test('formulário ocupado bloqueia submissão repetida por Enter e libera nova tentativa após falha', async () => {
  let calls = 0,
    release;
  const elements = [];
  const context = vm.createContext({
    e_: 'Conta',
    T: (...args) => {
      const item = element(...args);
      elements.push(item);
      return item;
    },
    ii() {},
  });
  vm.runInContext(declaration('Ch'), context);
  context.Ch('Conta', 'Código', [], 'Entrar', () => {
    calls++;
    return new Promise((_resolve, reject) => {
      release = () => reject(new Error('Código expirado'));
    });
  });
  const form = elements.find((item) => item.tag === 'form');
  const button = elements.find((item) => item.tag === 'button');
  const error = elements.find((item) => item.attrs.role === 'alert');
  const event = { preventDefault() {} };
  const pending = form.onsubmit(event);
  assert.equal(form.attrs['aria-busy'], 'true');
  await form.onsubmit(event);
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  release();
  await pending;
  assert.equal(error.textContent, 'Código expirado');
  assert.equal(button.disabled, false);
  assert.equal(form.attrs['aria-busy'], undefined);
  const retry = form.onsubmit(event);
  assert.equal(calls, 2);
  release();
  await retry;
});

function logoutContext() {
  const state = { user: { id: 'u1', nick: 'Pessoa' }, ticket: 'ticket', auth: {} };
  const requests = [];
  const context = vm.createContext({
    xt: state,
    wi: { readOnly: true, maxLength: 12, value: 'Pessoa' },
    localStorage: { getItem: () => 'Visitante' },
    qt: async (...args) => {
      requests.push(args);
      if (context.failure) throw new Error(context.failure);
      return { ok: true };
    },
    ts: (value) => {
      context.xt = value;
    },
  });
  vm.runInContext(declaration('ay'), context);
  return { context, state, requests };
}

test('logout com falha HTTP/rede preserva usuário e apelido; confirmação do servidor limpa a sessão visual', async () => {
  const { context, state, requests } = logoutContext();
  context.failure = 'Serviço indisponível';
  await assert.rejects(context.ay(), /indisponível/);
  assert.equal(context.xt, state);
  assert.equal(context.wi.readOnly, true);
  assert.equal(context.wi.value, 'Pessoa');
  context.failure = '';
  await context.ay();
  assert.equal(context.xt.user, null);
  assert.equal(context.xt.ticket, null);
  assert.equal(context.wi.readOnly, false);
  assert.equal(context.wi.value, 'Visitante');
  assert.equal(requests[1][0], '/api/auth/logout');
  assert.equal(requests[1][1].method, 'POST');
});

test('botão de logout informa erro e permite tentar de novo sem fechar conta nem alegar sucesso', async () => {
  const start = client.indexOf(
    '(x.onclick = async () => {',
    client.indexOf('const __signOutStatus ='),
  );
  const end = client.indexOf('\n        }),\n        g.append(', start);
  assert.ok(start >= 0 && end > start);
  const body = client.slice(start + '(x.onclick = async () => {'.length, end);
  const x = element('button');
  const status = element('p');
  let calls = 0,
    closed = 0,
    toasted = 0;
  const context = vm.createContext({
    x,
    __signOutStatus: status,
    ay: async () => {
      calls++;
      if (context.fail) throw new Error('Rede');
    },
    t: {
      close() {
        closed++;
      },
    },
    n: {
      playing: () => true,
      toast() {
        toasted++;
      },
    },
  });
  vm.runInContext(`run = async () => {${body}}`, context);
  context.fail = true;
  await context.run();
  assert.match(status.textContent, /Não foi possível sair/);
  assert.equal(closed, 0);
  assert.equal(toasted, 0);
  assert.equal(x.disabled, false);
  assert.equal(x.attrs['aria-busy'], undefined);
  context.fail = false;
  await context.run();
  assert.equal(calls, 2);
  assert.equal(status.textContent, '');
  assert.equal(closed, 1);
  assert.equal(toasted, 1);
});

test('código em loopback não promete envio de e-mail; produção não revela código local', () => {
  for (const local of [true, false]) {
    const forms = [];
    const context = vm.createContext({
      __emailLoginEpoch: 0,
      __loopbackClient: local,
      __localAuthCodes: new Map(),
      __emailLoginAvailable: () => true,
      Rx: 0,
      clearInterval() {},
      setInterval() {
        return 1;
      },
      xt: {},
      Gi: { open: true, contains: () => true },
      __withReferral: (_path, body) => body,
      T: element,
      Kr: () => ({}),
      go: (_label, input) => input,
      Zr: () => ({}),
      Ch: (...args) => forms.push(args),
      ro() {},
      qt() {},
    });
    vm.runInContext(declaration('Ea'), context);
    context.Ea('email-codigo', 'pessoa@example.com', '', { localCode: '123456', resendAfter: 60 });
    const title = forms[0][1];
    const status = forms[0][5][0];
    if (local) {
      assert.match(title, /código local/);
      assert.match(status.textContent, /123456.*Nenhum e-mail foi enviado/);
      assert.doesNotMatch(title, /Enviamos/);
    } else {
      assert.match(title, /Enviamos/);
      assert.doesNotMatch(status.textContent, /123456/);
      assert.equal(context.__localAuthCodes.size, 0);
    }
  }
});

test('confirmação realtime de apelido atualiza conta em memória e preserva os benefícios', () => {
  const start = client.indexOf('Y.addEventListener("nick", (n) => {');
  const end = client.indexOf('\nY.addEventListener("error"', start);
  assert.ok(start > 0 && end > start);
  let handler,
    closed = 0;
  const context = vm.createContext({
    xt: { user: { id: 'u1', nick: 'Antigo', apoiador: true }, ticket: 't1' },
    In: { readOnly: true },
    Y: {
      addEventListener(_name, callback) {
        handler = callback;
      },
    },
    d8() {},
    pe: () => ({
      close() {
        closed++;
      },
    }),
    ts: (value) => {
      context.xt = value;
    },
    localStorage: {
      setItem() {
        throw new Error('Não deve salvar conta em apelido visitante');
      },
    },
  });
  vm.runInContext(client.slice(start, end), context);
  handler({ detail: { nick: 'Novo' } });
  assert.equal(context.xt.user.nick, 'Novo');
  assert.equal(context.xt.user.apoiador, true);
  assert.equal(context.xt.ticket, 't1');
  assert.equal(closed, 1);
});

test('área do parceiro só aparece quando a API confirma enabled true; falhas não geram link', async () => {
  for (const scenario of [
    { ok: true, body: { enabled: false, partners: [] }, expected: null },
    { ok: true, body: { enabled: true, partners: [] }, expected: '/parceiro' },
    { ok: true, body: {}, expected: null },
    { ok: false, body: { enabled: true }, expected: null },
    { ok: true, jsonFailure: true, expected: null },
    { networkFailure: true, expected: null },
  ]) {
    let calls = 0;
    const context = vm.createContext({
      xt: { user: { nick: 'Pessoa', nickPending: false } },
      cn: true,
      tl: true,
      Ao: 'https://manifestacoes.com',
      an: '/api/jogos/manifestacao',
      vd: null,
      fetch: async () => {
        calls++;
        if (scenario.networkFailure) throw new Error('Rede');
        return {
          ok: scenario.ok,
          json: async () => {
            if (scenario.jsonFailure) throw new Error('JSON inválido');
            return scenario.body;
          },
        };
      },
    });
    vm.runInContext(declaration('Kx'), context);
    assert.equal(await context.Kx(), scenario.expected);
    assert.equal(await context.Kx(), scenario.expected);
    assert.equal(calls, 1, 'mantém cache por conta sem repetir chamadas');
    context.xt = { user: { nick: 'Nova', nickPending: true } };
    assert.equal(await context.Kx(), null);
    assert.equal(calls, 1, 'não consulta área do parceiro para apelido pendente');
  }
});
