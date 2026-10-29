/* Fallback de retratos compatível com CSP sem scripts inline. */
document.addEventListener(
  'error',
  (event) => {
    if (event.target?.matches?.('img[data-local-hide-on-error]')) {
      event.target.style.visibility = 'hidden';
    }
  },
  true,
);

/* Compatibilidade do menu de ações em navegadores sem a Popover API. */
(() => {
  'use strict';
  const nativePopover = typeof HTMLElement.prototype.showPopover === 'function';
  window.__localPopoverSelector = nativePopover ? ':popover-open' : '[data-local-popover-open]';
  if (nativePopover) return;
  const open = new Set();
  const invokers = new WeakMap();
  const emit = (element, type, oldState, newState) => {
    const event = new Event(type, { cancelable: type === 'beforetoggle' && newState === 'open' });
    Object.defineProperties(event, {
      oldState: { value: oldState },
      newState: { value: newState },
    });
    return element.dispatchEvent(event);
  };
  const close = (element) => {
    if (!open.has(element)) return;
    emit(element, 'beforetoggle', 'open', 'closed');
    open.delete(element);
    element.removeAttribute('data-local-popover-open');
    invokers.get(element)?.setAttribute('aria-expanded', 'false');
    emit(element, 'toggle', 'open', 'closed');
  };
  Object.defineProperty(HTMLElement.prototype, 'popover', {
    configurable: true,
    get() {
      return this.getAttribute('popover');
    },
    set(value) {
      if (value == null) this.removeAttribute('popover');
      else this.setAttribute('popover', String(value));
    },
  });
  Object.defineProperties(HTMLElement.prototype, {
    showPopover: {
      configurable: true,
      value: function () {
        if (open.has(this) || !this.isConnected || !this.hasAttribute('popover')) return;
        if (!emit(this, 'beforetoggle', 'closed', 'open')) return;
        if (this.popover !== 'manual')
          for (const element of [...open]) if (element.popover !== 'manual') close(element);
        open.add(this);
        this.setAttribute('data-local-popover-open', '');
        invokers.get(this)?.setAttribute('aria-expanded', 'true');
        emit(this, 'toggle', 'closed', 'open');
      },
    },
    hidePopover: {
      configurable: true,
      value: function () {
        close(this);
      },
    },
    togglePopover: {
      configurable: true,
      value: function (force) {
        const show = typeof force === 'boolean' ? force : !open.has(this);
        if (show) this.showPopover();
        else close(this);
        return open.has(this);
      },
    },
  });
  const style = document.createElement('style');
  style.textContent =
    '[popover]:not([data-local-popover-open]){display:none!important}[popover][data-local-popover-open]{display:block;z-index:1000}';
  document.head.append(style);
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[popovertarget]');
    if (!button || button.disabled) return;
    const element = document.getElementById(button.getAttribute('popovertarget'));
    if (!element?.hasAttribute('popover')) return;
    invokers.set(element, button);
    const action = button.getAttribute('popovertargetaction');
    if (action === 'show') element.showPopover();
    else if (action === 'hide') element.hidePopover();
    else element.togglePopover();
  });
  document.addEventListener('pointerdown', (event) => {
    for (const element of [...open]) {
      if (
        element.popover !== 'manual' &&
        !element.contains(event.target) &&
        !invokers.get(element)?.contains(event.target)
      )
        close(element);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const element = [...open].reverse().find((item) => item.popover !== 'manual');
    if (!element) return;
    event.preventDefault();
    close(element);
    invokers.get(element)?.focus();
  });
})();
