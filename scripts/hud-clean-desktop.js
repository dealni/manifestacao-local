function createDesktopShortcut(document, dock, button, stop, config) {
  const target = document.querySelector(config.selector);
  if (!target) return;
  const shortcut = button(config.id, config.text);
  shortcut.className = 'action-category ' + config.id;
  shortcut.setAttribute('aria-label', config.label);
  shortcut.addEventListener('click', () => {
    stop();
    target.click();
    config.after?.();
  });
  dock.prepend(shortcut);
  return shortcut;
}

function replaceOnce(source, before, after) {
  const at = source.indexOf(before);
  if (at < 0 || at !== source.lastIndexOf(before)) {
    throw new Error(`Patch de HUD desktop incompatível ou ambíguo: ${before.slice(0, 80)}`);
  }
  return source.replace(before, after);
}

/** Runtime sem dependências do bundle: as referências são injetadas pelo gerador. */
export function installCleanDesktop({ document, media, storage, stop = () => {} }) {
  const chat = document.querySelector('#chat-content');
  const chatToggle = document.querySelector('#chat-toggle');
  const chevron = document.querySelector('#chat-chevron');
  const map = document.querySelector('.map-panel');
  const dock = document.querySelector('.dock');
  const area = document.querySelector('.action-area');
  const keys = {
    chat: 'manifestacoes.hud.desktop.chat.v1',
    map: 'manifestacoes.hud.desktop.map.v1',
    dock: 'manifestacoes.hud.desktop.actions.v1',
  };
  // Navegação privada e políticas de armazenamento podem lançar inclusive no getter.
  if (!storage) {
    try {
      storage = document.defaultView.localStorage;
    } catch {
      /* A interface continua utilizável quando o navegador recusa esta operação opcional. */
    }
  }
  const expanded = {};
  for (const name of Object.keys(keys)) {
    try {
      expanded[name] = storage?.getItem(keys[name]) === 'open';
    } catch {
      expanded[name] = false;
    }
  }
  const button = (id, label, controls) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.id = id;
    element.className = 'clean-hud-toggle';
    element.textContent = label;
    if (controls) element.setAttribute('aria-controls', controls);
    return element;
  };
  const mapContents = [...map.children];
  map.id ||= 'desktop-map-panel';
  dock.id ||= 'desktop-action-dock';
  const mapToggle = button('desktop-map-toggle', 'Mapa', map.id);
  const dockToggle = button('desktop-actions-toggle', 'Ações', dock.id);
  map.prepend(mapToggle);
  dock.before(dockToggle);
  chatToggle.setAttribute('aria-controls', 'chat-content');
  // Som não é apenas um veículo: também reúne caixas e a escolha de músicas.
  // Um acesso no primeiro nível mantém o painel original e seus requisitos.
  const soundShortcut = createDesktopShortcut(document, dock, button, stop, {
    selector: '[data-action="som"]',
    id: 'desktop-sound-shortcut',
    text: 'Som · músicas',
    label: 'Som e músicas',
  });
  const activitiesShortcut = createDesktopShortcut(document, dock, button, stop, {
    selector: '#options',
    id: 'desktop-activities-shortcut',
    text: 'Atividades',
    label: 'Atividades: missões e corrida',
    after: () =>
      document
        .querySelector('#graphics-options .game-activities')
        ?.scrollIntoView({ block: 'center' }),
  });
  function persist(name) {
    try {
      storage?.setItem(keys[name], expanded[name] ? 'open' : 'closed');
    } catch {
      /* A interface continua utilizável quando o navegador recusa esta operação opcional. */
    }
  }
  function restoreFocus(desktop) {
    // A troca de breakpoint também pode recolher um painel. Não deixe o foco
    // preso em conteúdo oculto nem em um dos atalhos exclusivos do desktop.
    const active = document.activeElement;
    mapToggle.hidden = dockToggle.hidden = !desktop;
    if (desktop) {
      for (const [panel, trigger, open] of [
        [chat, chatToggle, expanded.chat],
        [map, mapToggle, expanded.map],
        [dock, dockToggle, expanded.dock],
      ]) {
        if (!open && panel.contains(active)) trigger.focus({ preventScroll: true });
      }
    } else if (
      active &&
      [mapToggle, dockToggle, soundShortcut, activitiesShortcut].includes(active)
    ) {
      document.querySelector('[data-mobile=menu]')?.focus({ preventScroll: true });
    }
    if (soundShortcut) soundShortcut.hidden = !desktop;
    if (activitiesShortcut) activitiesShortcut.hidden = !desktop;
  }
  function hideDockPopovers(desktop) {
    if (desktop && !expanded.dock)
      for (const panel of dock.querySelectorAll('.action-popover')) {
        try {
          panel.hidePopover();
        } catch {
          /* Navegadores sem Popover API continuam usando o painel convencional. */
        }
      }
  }
  function render() {
    const desktop = !media.matches;
    restoreFocus(desktop);
    // MH mantém sua própria conversa no mobile. Nunca a sobrescrever aqui.
    if (desktop) {
      chat.hidden = !expanded.chat;
      chatToggle.setAttribute('aria-expanded', String(expanded.chat));
      chevron.textContent = expanded.chat ? '−' : '+';
    }
    for (const child of mapContents) child.hidden = desktop && !expanded.map;
    hideDockPopovers(desktop);
    dock.hidden = desktop && !expanded.dock;
    map.classList.toggle('clean-map-collapsed', desktop && !expanded.map);
    area.classList.toggle('clean-actions-collapsed', desktop && !expanded.dock);
    mapToggle.setAttribute('aria-expanded', String(expanded.map));
    mapToggle.setAttribute('aria-label', expanded.map ? 'Recolher mapa' : 'Abrir mapa');
    dockToggle.setAttribute('aria-expanded', String(expanded.dock));
    dockToggle.setAttribute('aria-label', expanded.dock ? 'Recolher ações' : 'Abrir ações');
    mapToggle.textContent = expanded.map ? 'Mapa −' : 'Mapa +';
    dockToggle.textContent = expanded.dock ? 'Ações −' : 'Ações +';
  }
  function set(name, value) {
    if (media.matches) return;
    expanded[name] = value;
    if (!value) {
      const target = name === 'map' ? map : name === 'dock' ? dock : chat;
      const trigger = name === 'map' ? mapToggle : name === 'dock' ? dockToggle : chatToggle;
      if (target.contains(document.activeElement)) trigger.focus({ preventScroll: true });
    }
    persist(name);
    render();
  }
  mapToggle.addEventListener('click', () => {
    stop();
    set('map', !expanded.map);
  });
  dockToggle.addEventListener('click', () => {
    stop();
    set('dock', !expanded.dock);
  });
  // O onclick existente continua sendo a única implementação da alternância do chat.
  chatToggle.addEventListener('click', () => {
    if (!media.matches) set('chat', !chat.hidden);
  });
  media.addEventListener('change', render);
  render();
  return {
    openChat() {
      set('chat', true);
    },
    set,
    render,
  };
}

export function applyCleanDesktop(source) {
  source = replaceOnce(
    source,
    '    (n.preventDefault(), pe("#chat-input").focus());',
    '    n.preventDefault();\n    if (!Hr?.active) __cleanDesktopHud.openChat();\n    pe("#chat-input").focus();',
  );
  return replaceOnce(
    source,
    'requestAnimationFrame(EC);\nexport { HB as g };',
    `${createDesktopShortcut.toString()}\nconst __cleanDesktopHud = (${installCleanDesktop.toString()})({ document, media: Hr.media, stop: rl });\nrequestAnimationFrame(EC);\nexport { HB as g };`,
  );
}
