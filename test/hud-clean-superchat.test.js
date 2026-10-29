import { requireServedArtifact } from './helpers/served-artifact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyCleanSuperchat } from '../scripts/hud-clean-superchat.js';

const raw = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
const prepared = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const source = requireServedArtifact(prepared, 'ni.hidden = Id.length === 0 && Of === 0');
function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
function element(tag, className = '', textContent = '') {
  const classes = new Set(className.split(' '));
  return {
    tag,
    className,
    textContent,
    children: [],
    attrs: {},
    style: {},
    dataset: {},
    hidden: true,
    append(...items) {
      this.children.push(...items);
    },
    replaceChildren(...items) {
      this.children = items;
    },
    setAttribute(key, value) {
      this.attrs[key] = value;
    },
    hasAttribute(key) {
      return key in this.attrs;
    },
    removeAttribute(key) {
      delete this.attrs[key];
    },
    hidePopover() {
      this.popoverHidden = true;
    },
    classList: {
      toggle(key, value) {
        const on = value ?? !classes.has(key);
        if (on) classes.add(key);
        else classes.delete(key);
        return on;
      },
      remove(key) {
        classes.delete(key);
      },
      contains(key) {
        return classes.has(key);
      },
    },
  };
}
function context() {
  const ctx = vm.createContext({
    T: element,
    Id: [],
    Of: 0,
    Uf: null,
    ni: element('div'),
    jo: element('div'),
    Lu: element('div'),
    Ya: element('div'),
    ji: element('div'),
    g4: 0,
    q6: null,
    PS: () => false,
    clearTimeout() {},
    Gf() {},
    IS() {},
    Re: (cents) => `${cents}`,
    z0: () => 1,
    X6: (item) => (item.message ? element('p', '', item.message) : null),
    document: { querySelector: () => null },
    window: { setTimeout: () => 1 },
  });
  vm.runInContext(`${declaration('FS')}\n${declaration('DS')}\n${declaration('zS')}`, ctx);
  return ctx;
}

test('fila vazia não cria botão flutuante; fila ativa e histórico continuam acessíveis', () => {
  const ctx = context();
  ctx.DS();
  assert.equal(ctx.ni.hidden, true);
  assert.equal(ctx.Lu.children.length, 1);
  ctx.Of = 2;
  ctx.DS();
  assert.equal(ctx.ni.hidden, false);
  assert.equal(ctx.Lu.children[1].textContent, '2 na fila');
  ctx.Of = 0;
  ctx.Id = [{ id: 'x', nick: 'Pessoa', cents: 100, message: 'Olá', reduced: true }];
  ctx.DS();
  assert.equal(ctx.ni.hidden, false);
  assert.equal(ctx.jo.children.length, 1);
  assert.equal(ctx.jo.children[0].title, 'Pessoa: Olá');
  assert.ok(!ctx.Lu.children.some((child) => child.textContent === '+ Superchat'));
});

test('mensagem automática compacta expande sem perder texto, progresso e moderação', () => {
  const ctx = context();
  const sent = [];
  ctx.PS = () => true;
  ctx.Nf = { send: (message) => sent.push(message) };
  const item = { id: 'x', nick: 'Pessoa', cents: 100, message: 'Mensagem inteira longa' };
  ctx.zS(item, 5000, true);
  assert.equal(ctx.Ya.hidden, false);
  const message = ctx.Ya.children.find((child) => child.tag === 'p');
  const details = ctx.Ya.children.find((child) => child.className === 'sc-details');
  assert.equal(details.attrs['aria-expanded'], 'false');
  assert.equal(message.textContent, item.message);
  details.onclick();
  assert.equal(ctx.Ya.classList.contains('sc-expanded'), true);
  assert.equal(details.attrs['aria-expanded'], 'true');
  assert.equal(message.tabIndex, 0);
  details.onclick();
  assert.equal(details.attrs['aria-expanded'], 'false');
  assert.equal(ctx.Ya.children.at(-1).style.animationDuration, '5000ms');
  const staff = ctx.Ya.children.find((child) => child.className === 'sc-staff');
  staff.children.forEach((button) => button.onclick());
  assert.equal(
    JSON.stringify(sent),
    JSON.stringify([{ t: 'sc_skip' }, { t: 'sc_reduce', id: 'x' }]),
  );
});

test('diálogos ocultam faixa e removem promoção popover acima do modal', () => {
  const ctx = context();
  ctx.ni.setAttribute('popover', 'manual');
  ctx.document.querySelector = () => ({ open: true });
  ctx.FS();
  assert.equal(ctx.ni.classList.contains('sc-dialog-open'), true);
  assert.equal(ctx.ni.hasAttribute('popover'), false);
  assert.equal(ctx.ni.popoverHidden, true);
  ctx.document.querySelector = () => null;
  ctx.FS();
  assert.equal(ctx.ni.classList.contains('sc-dialog-open'), false);
  assert.ok(!declaration('FS').includes('showPopover'));
});

test('patch exige origem compatível e mantém envio, áudio e histórico originais', () => {
  assert.throws(() => applyCleanSuperchat(''), /incompatível/);
  assert.throws(() => applyCleanSuperchat(source), /incompatível/);
  assert.ok(source.includes('n.topActions.prepend(e)'));
  assert.ok(source.includes('n.chatForm.prepend(t)'));
  const patchedFixture = applyCleanSuperchat(raw);
  for (const name of ['Jv', 'cj', 'rj', 'zd']) {
    const start = raw.indexOf(`function ${name}(`);
    const end = raw.indexOf('\n}', start) + 2;
    assert.ok(patchedFixture.includes(raw.slice(start, end)), name);
  }
});

// A origem bruta e a origem adaptada pelas etapas anteriores precisam funcionar.
test('patch aceita a origem bruta e a origem após os designers e economia de pontos', () => {
  assert.ok(applyCleanSuperchat(raw).includes('ni.hidden = Id.length === 0 && Of === 0'));
  const adapted = raw.replaceAll(
    'Mande um superchat com Pix',
    'Envie um superchat com seus pontos',
  );
  assert.ok(applyCleanSuperchat(adapted).includes('ni.hidden = Id.length === 0 && Of === 0'));
});
