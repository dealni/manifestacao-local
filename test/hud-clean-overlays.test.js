import { requireServedArtifact } from './helpers/served-artifact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import {
  applyCleanOverlays,
  showTemporaryControlHint,
  installCleanNoticeStack,
} from '../scripts/hud-clean-overlays.js';

const raw = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
test('patch de avisos exige âncoras únicas e balões evitam controles e avisos', () => {
  assert.throws(() => applyCleanOverlays(''), /incompatível ou ambíguo/);
  const source = requireServedArtifact(raw, 'function installCleanNoticeStack()');
  assert.throws(() => applyCleanOverlays(source), /incompatível ou ambíguo/);
  assert.match(
    source,
    /#style-picker, \.mobile-control-hint, \.mobile-context, \.sc-bar, #toast, #connection/,
  );
});

test('dica expira, atualizações iguais não prolongam prazo e mudança de modo reapresenta', () => {
  let pending, cleared;
  const context = vm.createContext({
    setTimeout(fn, ms) {
      assert.equal(ms, 6500);
      pending = fn;
      return 7;
    },
    clearTimeout(id) {
      cleared = id;
    },
  });
  vm.runInContext(
    `${showTemporaryControlHint.toString()};globalThis.show = showTemporaryControlHint;`,
    context,
  );
  const hint = { textContent: 'A pé', hidden: false };
  context.show(hint);
  pending();
  assert.equal(hint.hidden, true);
  context.show(hint);
  assert.equal(hint.hidden, true);
  hint.textContent = 'Carro';
  context.show(hint);
  assert.equal(hint.hidden, false);
  assert.equal(cleared, 7);
  pending();
  context.show(hint, true);
  assert.equal(hint.hidden, false, 'reentrada no jogo reapresenta a dica');
});

test('pilha mede somente avisos visíveis e recoloca após mudança de altura/viewport', () => {
  let layout, observer;
  const media = { matches: true, addEventListener() {} };
  const values = {};
  const element = (height, hidden = false) => ({
    hidden,
    style: {
      setProperty(k, v) {
        this[k] = v;
      },
      removeProperty(k) {
        delete this[k];
      },
    },
    closest: () => null,
    getBoundingClientRect: () => ({ width: 300, height }),
    computed: { display: 'block', visibility: 'visible' },
  });
  const bar = element(60);
  bar.getBoundingClientRect = () => ({ width: 390, height: 60, bottom: 84 });
  const hint = element(18);
  const connection = element(40),
    race = element(30),
    toast = element(25, true),
    sc = element(0),
    debate = element(20),
    peace = element(20);
  const notices = {
    '.topbar': [bar],
    '.mobile-control-hint': [hint],
    '#connection': [connection],
    '.race-guidance': [race],
    '#toast': [toast],
    '.sc-bar': [sc],
    '.palanque-live': [debate],
    '.peace-zone-badge': [peace],
  };
  const body = { classList: { contains: () => true } };
  const context = vm.createContext({
    matchMedia: () => media,
    document: {
      body,
      documentElement: {
        style: {
          setProperty(k, v) {
            values[k] = v;
          },
        },
      },
      querySelectorAll: (s) => notices[s] || [],
    },
    window: { addEventListener() {} },
    getComputedStyle: (e) => e.computed,
    requestAnimationFrame(fn) {
      layout = fn;
      return 1;
    },
    showTemporaryControlHint() {},
    ResizeObserver: class {
      observe() {}
    },
    MutationObserver: class {
      constructor(fn) {
        observer = fn;
      }
      observe() {}
    },
  });
  vm.runInContext(`(${installCleanNoticeStack.toString()})();`, context);
  layout();
  assert.equal(connection.style['--clean-notice-top'], '92px');
  assert.equal(race.style['--clean-notice-top'], '140px');
  assert.equal(debate.style['--clean-notice-top'], '178px');
  assert.equal(peace.style['--clean-notice-top'], '206px');
  assert.equal(hint.style['--clean-notice-top'], '234px', 'dica vem depois dos avisos');
  assert.equal(toast.style['--clean-notice-top'], undefined);
  assert.equal(sc.style['--clean-notice-top'], undefined);
  toast.hidden = false;
  observer([{ target: body }]);
  layout();
  assert.equal(toast.style['--clean-notice-top'], '178px');
  assert.equal(debate.style['--clean-notice-top'], '211px');
  bar.getBoundingClientRect = () => ({ width: 844, height: 52, bottom: 52 });
  observer([{ target: body }]);
  layout();
  assert.equal(
    connection.style['--clean-notice-top'],
    '60px',
    'barra landscape medida sem somar safe-area duas vezes',
  );
  media.matches = false;
  observer([{ target: body }]);
  layout();
  assert.equal(connection.style['--clean-notice-top'], undefined);
});
