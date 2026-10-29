import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/local-compat.js', import.meta.url), 'utf8');
function fixture(native = false) {
  class Element extends EventTarget {
    constructor() {
      super();
      this.attributes = new Map();
      this.isConnected = true;
      this.children = [];
    }
    getAttribute(key) {
      return this.attributes.get(key) ?? null;
    }
    setAttribute(key, value) {
      this.attributes.set(key, value);
    }
    removeAttribute(key) {
      this.attributes.delete(key);
    }
    hasAttribute(key) {
      return this.attributes.has(key);
    }
    contains(target) {
      return target === this || this.children.includes(target);
    }
    append(child) {
      this.children.push(child);
    }
    closest(selector) {
      return selector === '[popovertarget]' && this.hasAttribute('popovertarget') ? this : null;
    }
    focus() {
      this.focused = true;
    }
  }
  const nativeShow = function () {};
  if (native) Element.prototype.showPopover = nativeShow;
  const document = new EventTarget();
  document.head = new Element();
  const ids = new Map();
  document.createElement = () => new Element();
  document.getElementById = (id) => ids.get(id);
  const window = {};
  vm.runInNewContext(source, { HTMLElement: Element, document, window, Event });
  const send = (type, target, key) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { target: { value: target }, key: { value: key } });
    document.dispatchEvent(event);
    return event;
  };
  const popover = (id, mode = 'auto') => {
    const panel = new Element();
    panel.popover = mode;
    ids.set(id, panel);
    const button = new Element();
    button.setAttribute('popovertarget', id);
    return { panel, button };
  };
  return { Element, document, window, send, popover, nativeShow };
}
test('navegador moderno preserva API nativa e seletor original', () => {
  const f = fixture(true);
  assert.equal(f.window.__localPopoverSelector, ':popover-open');
  assert.equal(f.Element.prototype.showPopover, f.nativeShow);
  assert.equal(f.document.head.children.length, 0);
});
test('fallback abre, alterna, informa aria-expanded e emite estado para posicionar menu', () => {
  const f = fixture();
  const { panel, button } = f.popover('actions');
  const events = [];
  panel.addEventListener('toggle', (event) => events.push([event.oldState, event.newState]));
  assert.equal(f.window.__localPopoverSelector, '[data-local-popover-open]');
  f.send('click', button);
  assert.equal(panel.hasAttribute('data-local-popover-open'), true);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  f.send('click', button);
  assert.equal(panel.hasAttribute('data-local-popover-open'), false);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(events, [
    ['closed', 'open'],
    ['open', 'closed'],
  ]);
  assert.match(f.document.head.children[0].textContent, /display:none!important/);
});
test('Escape restaura foco; clique dentro preserva e fora fecha somente auto', () => {
  const f = fixture();
  const a = f.popover('auto');
  const m = f.popover('manual', 'manual');
  f.send('click', a.button);
  f.send('pointerdown', a.panel);
  assert.equal(a.panel.hasAttribute('data-local-popover-open'), true);
  const event = f.send('keydown', a.panel, 'Escape');
  assert.equal(event.defaultPrevented, true);
  assert.equal(a.button.focused, true);
  f.send('click', a.button);
  m.panel.showPopover();
  f.send('pointerdown', new f.Element());
  assert.equal(a.panel.hasAttribute('data-local-popover-open'), false);
  assert.equal(m.panel.hasAttribute('data-local-popover-open'), true);
});
test('abrir outro menu automático fecha anterior e beforetoggle pode impedir abertura', () => {
  const f = fixture();
  const a = f.popover('a');
  const b = f.popover('b');
  a.panel.showPopover();
  b.panel.showPopover();
  assert.equal(a.panel.hasAttribute('data-local-popover-open'), false);
  assert.equal(b.panel.hasAttribute('data-local-popover-open'), true);
  b.panel.hidePopover();
  b.panel.addEventListener('beforetoggle', (event) => {
    if (event.newState === 'open') event.preventDefault();
  });
  b.panel.showPopover();
  assert.equal(b.panel.hasAttribute('data-local-popover-open'), false);
});
