import { requireServedArtifact } from './helpers/served-artifact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyShopDesign } from '../scripts/design-shop.js';

const original = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const client = requireServedArtifact(original, 'let __shopLoading =');
const declaration = (name, next) =>
  client.slice(
    client.indexOf(`function ${name}(`),
    client.indexOf(`\nfunction ${next}(`, client.indexOf(`function ${name}(`)),
  );
function element(tag, className = '', text = '') {
  return {
    tag,
    className,
    textContent: text,
    children: [],
    attrs: {},
    dataset: {},
    value: '',
    disabled: false,
    hidden: false,
    classList: { toggle() {} },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    replaceChildren(...nodes) {
      this.children = nodes;
    },
    querySelectorAll() {
      return this.children.filter((node) => node.tag === 'button');
    },
    focus() {},
  };
}
function focusableElement(doc, ...args) {
  const node = element(...args);
  let disabled = false;
  node.focus = () => {
    doc.activeElement = node;
  };
  Object.defineProperty(node, 'disabled', {
    get: () => disabled,
    set(value) {
      disabled = value;
      if (value && doc.activeElement === node) doc.activeElement = doc.body;
    },
  });
  return node;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
function superchat(rules = {}) {
  let form,
    requests = 0,
    reject,
    resolve,
    confirmed = 0;
  const doc = { body: {} };
  doc.activeElement = doc.body;
  const ctx = vm.createContext({
    document: doc,
    QS() {},
    cn: true,
    Gx: () => ({
      live: true,
      maxChars: 300,
      suggested: [10, 100],
      min: 10,
      max: 1000,
      voiceMin: 100,
      adMin: 100,
      voices: [{ id: 'voice', name: 'Voz' }],
      ...rules,
    }),
    gn: () => ({ nick: 'Teste' }),
    T: (...args) => focusableElement(doc, ...args),
    Re: (value) => `${value} pontos`,
    matchMedia: () => ({ matches: true }),
    sd: (...nodes) => {
      form = nodes.find((node) => node.tag === 'form');
    },
    Gi: { open: true, contains: (node) => node === form },
    qt: async () => {
      requests++;
      return new Promise((success, fail) => {
        resolve = success;
        reject = fail;
      });
    },
    an: '/api/jogos/manifestacao',
    lj() {
      confirmed++;
    },
  });
  vm.runInContext(declaration('zd', 'lj'), ctx);
  ctx.zd();
  return {
    form,
    doc,
    dialog: ctx.Gi,
    requests: () => requests,
    fail: () => reject(new Error('Saldo insuficiente.')),
    close: () => {
      ctx.Gi.open = false;
    },
    success: () => resolve({ status: 'paid' }),
    confirmed: () => confirmed,
  };
}

test('adaptador exige âncoras únicas e remove promessa gratuita das aquisições pagas', () => {
  assert.throws(() => applyShopDesign(''), /incompatível ou ambíguo/);
  assert.throws(() => applyShopDesign(client), /incompatível ou ambíguo/);
  assert.doesNotMatch(client, /Simulação gratuita|Desbloquear gratuito no modo local/);
  assert.match(client, /Resgatar por \$\{Re\(s.cents\)\}/);
});

test('superchat anuncia campos, grupos, seleção e erro de saldo; falha permite nova tentativa explícita', async () => {
  const view = superchat();
  const inputs = view.form.children.filter((node) => ['input', 'textarea'].includes(node.tag));
  assert.deepEqual(
    inputs.map((input) => input.attrs['aria-label']),
    [
      'Nome da sua conta',
      'Mensagem do superchat (obrigatória)',
      'Quantidade personalizada de pontos',
    ],
  );
  const groups = view.form.children.filter((node) => node.attrs.role === 'group');
  assert.equal(groups.length, 2);
  assert.equal(groups[0].children[0].attrs['aria-pressed'], 'true');
  groups[0].children[1].onclick();
  assert.equal(groups[0].children[0].attrs['aria-pressed'], 'false');
  assert.equal(groups[0].children[1].attrs['aria-pressed'], 'true');
  assert.equal(groups[1].children[0].attrs['aria-pressed'], 'true');
  const submit = view.form.children.find((node) => node.type === 'submit');
  const request = view.form.onsubmit({ preventDefault() {} });
  assert.equal(submit.disabled, true);
  assert.equal(view.form.attrs['aria-busy'], 'true');
  view.fail();
  await request;
  assert.equal(view.form.attrs['aria-busy'], 'false');
  assert.equal(submit.disabled, false);
  const error = view.form.children.find((node) => node.attrs.role === 'alert');
  assert.equal(error.textContent, 'Saldo insuficiente.');
  assert.equal(view.requests(), 1);
});

test('alterar quantidade durante envio não reativa submit nem duplica resgate', async () => {
  const view = superchat();
  const submit = view.form.children.find((node) => node.type === 'submit');
  const custom = view.form.children.find((node) => node.type === 'number');
  const request = view.form.onsubmit({ preventDefault() {} });
  custom.value = '100';
  custom.oninput();
  assert.equal(submit.disabled, true);
  await view.form.onsubmit({ preventDefault() {} });
  assert.equal(view.requests(), 1);
  view.fail();
  await request;
});

function shop() {
  const pending = [],
    listeners = {};
  const nodes = new Map();
  const get = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, element(selector));
    return nodes.get(selector);
  };
  const filters = ['catalog', 'owned'].map((filter) => ({
    ...element('button'),
    dataset: { filter },
  }));
  const dialog = {
    ...element('dialog'),
    open: false,
    querySelector: get,
    querySelectorAll: (selector) => (selector === '[data-filter]' ? filters : []),
    addEventListener(name, callback) {
      listeners[name] = callback;
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
      listeners.close();
    },
  };
  let buys = 0,
    equipped = 0;
  const ctx = vm.createContext({
    document: { createElement: () => dialog, body: { append() {} } },
    T: element,
    qt: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    URLSearchParams,
    Re: (value) => `${value} pontos`,
    zi: () => [],
    __freeAccess: () => false,
    gn: () => true,
    ci: (value) => value,
    Wb: (value) => value,
    is() {},
    Wo: [{ name: 'Time' }],
    clearTimeout() {},
    hg: async () => {
      buys++;
      return null;
    },
    window: { setTimeout() {} },
  });
  vm.runInContext(declaration('XO', '$O'), ctx);
  const instance = ctx.XO({
    team: () => 0,
    equip: () => equipped++,
    toast() {},
  });
  instance.open();
  return { instance, get, filters, pending, ctx, buys: () => buys, equipped: () => equipped };
}
const skin = {
  key: 'teste',
  name: 'Teste',
  model: 'teste',
  description: 'Personagem',
  cents: 50,
  enabled: true,
};

test('loja impede compra da seleção anterior durante busca e remove seleção de resultado vazio', async () => {
  const view = shop();
  view.pending.shift().resolve({ total: 1, items: [skin] });
  await tick();
  assert.equal(view.get('[data-buy]').disabled, false);
  assert.equal(view.get('[data-buy]').textContent, 'Resgatar por 50 pontos');
  view.filters[1].onclick();
  assert.equal(view.get('[data-buy]').disabled, true);
  await view.get('[data-buy]').onclick();
  assert.equal(view.buys(), 0);
  view.pending.shift().resolve({ total: 0, items: [] });
  await tick();
  assert.equal(view.get('.skin-feature').hidden, true);
  await view.get('[data-buy]').onclick();
  assert.equal(view.buys(), 0);
});

test('falha de catálogo não mantém aquisição antiga e resposta após fechar é descartada', async () => {
  const view = shop();
  view.pending.shift().resolve({ total: 1, items: [skin] });
  await tick();
  view.filters[1].onclick();
  view.pending.shift().reject(new Error('Rede indisponível'));
  await tick();
  assert.equal(view.get('.skin-feature').hidden, true);
  await view.get('[data-buy]').onclick();
  assert.equal(view.buys(), 0);
  view.filters[0].onclick();
  const pending = view.pending.shift();
  view.instance.element.close();
  pending.resolve({ total: 1, items: [skin] });
  await tick();
  assert.equal(view.get('.skin-feature').hidden, true);
});

test('pesquisa bloqueia seleção antiga imediatamente e invalida catálogo durante debounce', async () => {
  const view = shop();
  view.pending.shift().resolve({ total: 1, items: [skin] });
  await tick();
  view.filters[1].onclick();
  const old = view.pending.shift();
  view.get('input[type="search"]').oninput({ target: { value: 'outro' } });
  old.resolve({ total: 1, items: [skin] });
  await tick();
  assert.equal(view.get('[data-buy]').disabled, true);
  await view.get('[data-buy]').onclick();
  assert.equal(view.buys(), 0);
});

test('compra concluída ou rejeitada após reabrir loja não equipa nem altera erro da nova janela', async () => {
  for (const failure of [false, true]) {
    const view = shop();
    view.pending.shift().resolve({ total: 1, items: [skin] });
    await tick();
    let resolvePurchase, rejectPurchase;
    view.ctx.hg = () =>
      new Promise((resolve, reject) => {
        resolvePurchase = resolve;
        rejectPurchase = reject;
      });
    const request = view.get('[data-buy]').onclick();
    view.instance.element.close();
    view.instance.open();
    view.pending.shift().resolve({ total: 1, items: [skin] });
    await tick();
    if (failure) rejectPurchase(new Error('Erro da janela anterior'));
    else {
      view.ctx.zi = () => [skin.key];
      resolvePurchase(true);
    }
    await request;
    assert.equal(view.equipped(), 0);
    assert.equal(view.instance.element.open, true);
    assert.equal(view.get('.skin-feedback').textContent, '');
  }
});

test('superchat concluído após fechar não reabre sucesso nem repete envio', async () => {
  const view = superchat();
  const request = view.form.onsubmit({ preventDefault() {} });
  view.close();
  view.success();
  await request;
  assert.equal(view.requests(), 1);
  assert.equal(view.confirmed(), 0);
});

function checkout() {
  let nodes = [],
    closed,
    resolvePurchase,
    rejectPurchase,
    updates = 0;
  const user = { nick: 'Teste' };
  const doc = { body: {} };
  doc.activeElement = doc.body;
  const ctx = vm.createContext({
    document: doc,
    cn: true,
    __freeAccess: () => false,
    xt: { user },
    an: '/api/jogos/manifestacao',
    T: (...args) => focusableElement(doc, ...args),
    Re: (value) => `${value} pontos`,
    AbortSignal,
    ts(account) {
      updates++;
      ctx.xt = account;
    },
    qt: async (_url, options) =>
      options?.method === 'POST'
        ? new Promise((resolve, reject) => {
            resolvePurchase = resolve;
            rejectPurchase = reject;
          })
        : { user },
    ii(_title, ...elements) {
      nodes = elements;
      ctx.Gi.open = true;
    },
    qo(callback) {
      closed = callback;
    },
    Gi: { open: false, contains: (node) => nodes.includes(node) },
    Ds: async () => null,
    ro() {},
  });
  vm.runInContext(`async ${declaration('Wr', 'Ag')}`, ctx);
  let owned = [];
  const promise = ctx.Wr(
    {
      eyebrow: 'LOJA',
      owned: () => owned,
      price: () => 50,
      endpoint: 'personagem',
      done: 'Liberado',
      use: 'Usar',
      yours: 'é seu',
    },
    'skin',
    'Personagem',
  );
  return {
    ctx,
    doc,
    promise,
    button: () => nodes.find((node) => node.tag === 'button'),
    updates: () => updates,
    content: () => nodes,
    success() {
      owned = ['skin'];
      resolvePurchase({
        status: 'paid',
        account: { user: { nick: 'Antigo' }, ticket: 'ticket-antigo' },
      });
    },
    fail() {
      rejectPurchase(new Error('Saldo insuficiente.'));
    },
    close() {
      ctx.Gi.open = false;
      closed();
    },
  };
}

test('checkout fechado descarta resposta tardia sem reabrir ou reintroduzir conta anterior', async () => {
  const view = checkout();
  await tick();
  const button = view.button();
  const request = button.onclick();
  const updates = view.updates();
  view.close();
  view.ctx.xt = { user: { nick: 'Nova conta' } };
  view.success();
  await request;
  assert.equal(await view.promise, null);
  assert.equal(view.updates(), updates);
  assert.equal(view.ctx.xt.user.nick, 'Nova conta');
  assert.equal(view.ctx.Gi.open, false);
});

test('checkout confirma resgate uma vez e anuncia saldo insuficiente com tentativa manual disponível', async () => {
  const success = checkout();
  await tick();
  const request = success.button().onclick();
  success.success();
  await request;
  assert.equal(await success.promise, 'ticket-antigo');
  assert.ok(success.content().some((node) => node.textContent === 'Liberado'));
  const failure = checkout();
  await tick();
  const button = failure.button();
  const rejected = button.onclick();
  failure.fail();
  await rejected;
  assert.equal(button.disabled, false);
  const error = failure.content().find((node) => node.attrs.role === 'alert');
  assert.equal(error.textContent, 'Saldo insuficiente.');
  failure.close();
  assert.equal(await failure.promise, null);
});

test('erro de compra recupera foco perdido ao desabilitar, preservando outro controle ou fluxo', async () => {
  for (const destination of ['body', 'dialog', 'other', 'closed']) {
    const view = checkout();
    await tick();
    const button = view.button();
    button.focus();
    const request = button.onclick();
    assert.equal(
      view.doc.activeElement,
      view.doc.body,
      'disabled reproduz perda de foco do navegador',
    );
    const other = {};
    if (destination === 'dialog') view.doc.activeElement = view.ctx.Gi;
    if (destination === 'other') view.doc.activeElement = other;
    if (destination === 'closed') view.close();
    view.fail();
    await request;
    if (destination === 'body' || destination === 'dialog')
      assert.equal(view.doc.activeElement, button);
    if (destination === 'other') assert.equal(view.doc.activeElement, other);
    if (destination === 'closed') assert.equal(view.doc.activeElement, view.doc.body);
    if (destination !== 'closed') view.close();
    await view.promise;
  }
});

test('erro de superchat recupera foco perdido sem capturar campo editado durante envio ou diálogo fechado', async () => {
  for (const destination of ['body', 'dialog', 'other', 'closed']) {
    const view = superchat();
    const button = view.form.children.find((node) => node.type === 'submit');
    button.focus();
    const request = view.form.onsubmit({ preventDefault() {} });
    assert.equal(view.doc.activeElement, view.doc.body);
    const other = view.form.children.find((node) => node.tag === 'textarea');
    if (destination === 'dialog') view.doc.activeElement = view.dialog;
    if (destination === 'other') other.focus();
    if (destination === 'closed') view.close();
    view.fail();
    await request;
    if (destination === 'body' || destination === 'dialog')
      assert.equal(view.doc.activeElement, button);
    if (destination === 'other') assert.equal(view.doc.activeElement, other);
    if (destination === 'closed') assert.equal(view.doc.activeElement, view.doc.body);
  }
});

test('superchat local exige texto e não promete voz, preço de anúncio ou moderação inexistente', () => {
  const view = superchat({ voices: [], voiceMin: undefined, adMin: undefined });
  const textarea = view.form.children.find((node) => node.tag === 'textarea');
  assert.equal(textarea.placeholder, 'Sua mensagem (obrigatória)');
  assert.equal(textarea.required, true);
  assert.equal(textarea.attrs['aria-label'], 'Mensagem do superchat (obrigatória)');
  const copy = view.form.children.map((node) => node.textContent).join(' ');
  assert.match(copy, /Texto a partir de 10 pontos/);
  assert.match(copy, /Voz e moderação automática não estão disponíveis/);
  assert.doesNotMatch(
    copy,
    /Indisponível|Com voz, a partir|Anúncio ou link:|passa por uma verificação automática/,
  );
});

test('recarregar catálogo atualiza preço e disponibilidade da seleção preservada', async () => {
  const view = shop();
  view.pending.shift().resolve({ total: 1, items: [skin] });
  await tick();
  view.filters[0].onclick();
  view.pending.shift().resolve({ total: 1, items: [{ ...skin, cents: 80, enabled: false }] });
  await tick();
  assert.equal(view.get('.skin-price').textContent, '80 pontos');
  assert.equal(view.get('[data-buy]').textContent, 'Fora de venda');
  assert.equal(view.get('[data-buy]').disabled, true);
});

test('resposta de compra anterior não libera aquisição pendente da loja reaberta', async () => {
  const view = shop();
  view.pending.shift().resolve({ total: 1, items: [skin] });
  await tick();
  const purchases = [];
  view.ctx.hg = () => new Promise((resolve) => purchases.push(resolve));
  const oldRequest = view.get('[data-buy]').onclick();
  view.instance.element.close();
  view.instance.open();
  view.pending.shift().resolve({ total: 1, items: [skin] });
  await tick();
  assert.equal(view.get('[data-buy]').disabled, false);
  const currentRequest = view.get('[data-buy]').onclick();
  assert.equal(purchases.length, 2);
  purchases[0](null);
  await oldRequest;
  assert.equal(view.get('[data-buy]').disabled, true);
  await view.get('[data-buy]').onclick();
  assert.equal(purchases.length, 2);
  purchases[1](null);
  await currentRequest;
  assert.equal(view.get('[data-buy]').disabled, false);
});
