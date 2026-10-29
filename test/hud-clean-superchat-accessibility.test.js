import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyCleanSuperchat } from '../scripts/hud-clean-superchat.js';

const raw = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
const patched = applyCleanSuperchat(raw);

function cardContext() {
  function element(tag, className, textContent) {
    const classes = new Set();
    return {
      tag,
      className,
      textContent,
      attrs: {},
      children: [],
      style: {},
      classList: {
        toggle(name) {
          if (classes.delete(name)) return false;
          classes.add(name);
          return true;
        },
      },
      setAttribute(name, value) {
        this.attrs[name] = value;
      },
      append(...children) {
        this.children.push(...children);
      },
      replaceChildren() {
        this.children = [];
      },
    };
  }
  const context = vm.createContext({
    T: element,
    Ya: element('div'),
    ji: {},
    g4: 0,
    q6: null,
    clearTimeout() {},
    Gf() {},
    z0: () => 1,
    Re: String,
    PS: () => false,
    X6: (item) => (item.message ? element('p', '', item.message) : null),
    window: { setTimeout: () => 1 },
  });
  const start = patched.indexOf('function zS(');
  vm.runInContext(patched.slice(start, patched.indexOf('\n}', start) + 2), context);
  return context;
}

test('expansão vincula o controle ao texto e permite rolagem por teclado', () => {
  const context = cardContext();
  context.zS({ id: 'one', cents: 100, nick: 'Pessoa', message: 'Mensagem extensa' }, 7000, false);
  const message = context.Ya.children.find((child) => child.tag === 'p');
  const details = context.Ya.children.find((child) => child.className === 'sc-details');
  assert.equal(details.attrs['aria-controls'], message.id);
  assert.equal(message.tabIndex, -1);
  details.onclick();
  assert.equal(details.attrs['aria-expanded'], 'true');
  assert.equal(message.tabIndex, 0);
  details.onclick();
  assert.equal(details.attrs['aria-expanded'], 'false');
  assert.equal(message.tabIndex, -1);
});

test('superchat sem texto não oferece uma expansão vazia', () => {
  const context = cardContext();
  context.zS({ id: 'audio', cents: 100, nick: 'Pessoa', audio: '/audio.mp3' }, 7000, false);
  assert.ok(!context.Ya.children.some((child) => child.className === 'sc-details'));
  assert.equal(context.Ya.children.at(-1).className, 'sc-progress');
});

test('prévia do histórico permite foco para rolar mensagens extensas por teclado', () => {
  const preview = {
    hidden: true,
    dataset: {},
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    replaceChildren() {},
    append() {},
  };
  const context = vm.createContext({
    ji: preview,
    $v: 0,
    clearTimeout() {},
    T: () => ({ append() {} }),
    X6: () => ({}),
    z0: () => 1,
    Re: String,
    window: { setTimeout: () => 1 },
  });
  const start = patched.indexOf('function oj(');
  vm.runInContext(patched.slice(start, patched.indexOf('\n}', start) + 2), context);
  context.oj({ id: 'history', cents: 100, nick: 'Pessoa', message: 'Mensagem longa' });
  assert.equal(preview.hidden, false);
  assert.equal(preview.tabIndex, 0);
  assert.equal(preview.attrs['aria-label'], 'Prévia do superchat');
});
