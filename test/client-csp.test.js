import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const compat = readFileSync(new URL('../public/local-compat.js', import.meta.url), 'utf8');

test('fallback de retrato usa listener de captura inclusive com Popover nativo', () => {
  const listeners = [];
  class Element {}
  Element.prototype.showPopover = () => {};
  vm.runInNewContext(compat, {
    document: { addEventListener: (...args) => listeners.push(args) },
    HTMLElement: Element,
    window: {},
  });
  const [type, handler, capture] = listeners[0];
  assert.equal(type, 'error');
  assert.equal(capture, true); // Erros de imagens não propagam por bubbling.
  const portrait = {
    style: {},
    matches: (selector) => selector === 'img[data-local-hide-on-error]',
  };
  handler({ target: portrait });
  assert.equal(portrait.style.visibility, 'hidden');
  const unrelated = { style: {}, matches: () => false };
  handler({ target: unrelated });
  assert.equal(unrelated.style.visibility, undefined);
  handler({ target: null });
});

test('cliente servido usa atributo declarativo sem handler inline de retrato', () => {
  const client = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  assert.ok(client.includes('data-local-hide-on-error'));
  assert.doesNotMatch(client, /onerror="this\.style\.visibility/);
});

test('convite de instalação referencia ícone disponível', () => {
  const client = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  assert.ok(client.includes('${Ps}icons/apple-touch-icon.png'));
  assert.ok(!client.includes('icons/icon-192.png'));
  const icon = readFileSync(new URL('../public/icons/apple-touch-icon.png', import.meta.url));
  assert.equal(icon.subarray(1, 4).toString(), 'PNG');
});
