import { requireServedArtifact } from './helpers/served-artifact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyDesignClient } from '../scripts/design-client.js';

const original = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const client = requireServedArtifact(original, 'const __previewMotion =');
function declaration(name, next) {
  const start = client.indexOf(`function ${name}(`);
  const end = client.indexOf(`\nfunction ${next}(`, start);
  assert.ok(start > 0 && end > start);
  return client.slice(start, end);
}

test('patch exige âncoras únicas e a dica está associada ao apelido', () => {
  assert.throws(() => applyDesignClient(''), /incompatível ou ambíguo/);
  assert.throws(() => applyDesignClient(client), /incompatível ou ambíguo/);
  assert.match(client, /id="nickname"[^>]*aria-describedby="nickname_hint"/);
  assert.match(client, /id="nickname_hint" class="nick-hint"/);
});

test('canais anunciam seleção inicial e sincronizam ambos os botões ao trocar', () => {
  assert.match(client, /data-channel="global" class="active" aria-pressed="true"/);
  assert.match(client, /data-channel="local" aria-pressed="false"/);
  const buttons = ['global', 'local'].map((channel) => ({
    dataset: { channel },
    attrs: {},
    classList: {
      toggle(_name, selected) {
        this.active = selected;
      },
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
  }));
  const ctx = vm.createContext({ document: { querySelectorAll: () => buttons }, rC: 'global' });
  const start = client.indexOf('document.querySelectorAll("[data-channel]").forEach(');
  const end = client.indexOf('\npe("#chat-toggle")', start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(client.slice(start, end), ctx);
  buttons[1].onclick();
  assert.equal(ctx.rC, 'local');
  assert.equal(buttons[0].attrs['aria-pressed'], 'false');
  assert.equal(buttons[1].attrs['aria-pressed'], 'true');
  buttons[0].onclick();
  assert.equal(buttons[0].attrs['aria-pressed'], 'true');
  assert.equal(buttons[1].attrs['aria-pressed'], 'false');
});

function preview(reduced) {
  const callbacks = [],
    rotations = [];
  const motion = { matches: reduced };
  let animations = 0;
  const canvas = {
    clientWidth: 300,
    clientHeight: 200,
    width: 300,
    height: 200,
    setPointerCapture() {},
  };
  const stage = { prepend() {} };
  const dialog = {
    setAttribute() {},
    querySelector: (selector) =>
      selector === '.flag-shop-stage' ? stage : selector === '.dialog-close' ? {} : null,
    showModal() {
      this.open = true;
    },
  };
  const camera = {
    fov: 30,
    position: {
      set(x, _y, z) {
        rotations.push(Math.atan2(x, z));
      },
    },
    updateProjectionMatrix() {},
    lookAt() {},
  };
  const ctx = vm.createContext({
    G3: null,
    document: { createElement: () => dialog, body: { append() {} }, hidden: false },
    gn: () => true,
    __freeAccess: () => false,
    Re: () => '',
    performance: { now: () => 0 },
    matchMedia: (query) => (query.includes('reduced-motion') ? motion : { matches: false }),
    requestAnimationFrame: (callback) => callbacks.push(callback),
    sV: () => ({
      canvas,
      renderer: { getPixelRatio: () => 1, render() {}, setSize() {} },
      scene: { add() {}, remove() {} },
      camera,
    }),
  });
  vm.runInContext(declaration('wS', 'oV'), ctx);
  ctx.wS({
    title: 'Veículo',
    cents: 0,
    radius: 1,
    centre: { x: 0, y: 0, z: 0 },
    model: {},
    animate() {
      animations++;
    },
  });
  return {
    canvas,
    motion,
    rotations,
    frame: (time) => callbacks.shift()(time),
    animations: () => animations,
  };
}

test('prévia respeita redução de movimento, mantém setas e não intercepta Escape ou Tab', () => {
  const view = preview(true);
  view.frame(1000);
  assert.ok(Math.abs(view.rotations.at(-1) - 0.7) < 1e-9);
  assert.equal(view.animations(), 0);
  let prevented = 0;
  for (const key of ['Escape', 'Tab', 'Enter'])
    view.canvas.onkeydown({
      key,
      preventDefault() {
        prevented++;
      },
    });
  assert.equal(prevented, 0);
  view.canvas.onkeydown({
    key: 'ArrowLeft',
    preventDefault() {
      prevented++;
    },
  });
  view.frame(1100);
  assert.ok(Math.abs(view.rotations.at(-1) - 0.9) < 1e-9);
  view.canvas.onkeydown({
    key: 'ArrowRight',
    preventDefault() {
      prevented++;
    },
  });
  view.frame(1200);
  assert.ok(Math.abs(view.rotations.at(-1) - 0.7) < 1e-9);
  assert.equal(prevented, 2);
  view.motion.matches = false;
  view.frame(1300);
  assert.ok(view.rotations.at(-1) > 0.7);
  assert.equal(view.animations(), 1);
  view.motion.matches = true;
  const last = view.rotations.at(-1);
  view.frame(1400);
  assert.equal(view.rotations.at(-1), last);
});

function dialogs() {
  const doc = { body: { append() {} } };
  function element(tag) {
    return {
      tag,
      children: [],
      open: false,
      setAttribute() {},
      addEventListener() {},
      append(...children) {
        this.children.push(...children);
      },
      contains(target) {
        return this === target || this.children.some((child) => child.contains?.(target));
      },
      replaceChildren(...children) {
        if (this.contains(doc.activeElement)) doc.activeElement = doc.body;
        this.children = children;
      },
      querySelector() {
        return this.children.find((child) => child.tag === 'h2' || child.tag === 'h3');
      },
      showModal() {
        this.open = true;
      },
      focus() {
        doc.activeElement = this;
      },
    };
  }
  doc.activeElement = doc.body;
  doc.querySelectorAll = () => (ctx.Gi?.open ? [ctx.Gi] : []);
  const ctx = vm.createContext({ document: doc, T: element, Gi: null, Zi() {}, Qm: null });
  vm.runInContext(declaration('ii', 'ro'), ctx);
  return { ctx, doc, element };
}

test('substituição do diálogo aberto recupera foco no título sem capturar foco externo', () => {
  const { ctx, doc, element } = dialogs();
  const button = element('button');
  ctx.ii('Conta', button);
  doc.activeElement = button;
  const heading = element('h2');
  ctx.ii('Pontos', heading);
  assert.equal(doc.activeElement, heading);
  assert.equal(heading.tabIndex, -1);
  const otherModalButton = element('button');
  doc.activeElement = otherModalButton;
  ctx.ii('Atualização', element('h2'));
  assert.equal(doc.activeElement, otherModalButton);
});

test('diálogo atualizado sem título usa cabeçalho acessível para recuperar o foco', () => {
  const { ctx, doc, element } = dialogs();
  const button = element('button');
  ctx.ii('Conta', button);
  doc.activeElement = button;
  ctx.ii('Carregando', element('p'));
  assert.equal(doc.activeElement, ctx.Gi.children[0]);
  assert.equal(doc.activeElement.tabIndex, -1);
});

test('não sobrescreve foco assumido por outro modal durante atualização', () => {
  const { ctx, doc, element } = dialogs();
  const button = element('button');
  ctx.ii('Conta', button);
  doc.activeElement = button;
  const external = element('button');
  const replace = ctx.Gi.replaceChildren.bind(ctx.Gi);
  ctx.Gi.replaceChildren = (...children) => {
    replace(...children);
    doc.activeElement = external;
  };
  ctx.ii('Saldo', element('h2'));
  assert.equal(doc.activeElement, external);
});

test('atualização recupera título quando disabled tirou foco e só há este modal', () => {
  const { ctx, doc, element } = dialogs();
  ctx.ii('Compra', element('button'));
  doc.activeElement = doc.body;
  const heading = element('h2');
  ctx.ii('Sucesso', heading);
  assert.equal(doc.activeElement, heading);
  doc.activeElement = doc.body;
  doc.querySelectorAll = () => [ctx.Gi, element('dialog')];
  ctx.ii('Atualização', element('h2'));
  assert.equal(doc.activeElement, doc.body);
});
