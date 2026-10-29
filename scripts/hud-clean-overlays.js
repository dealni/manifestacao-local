function replaceOnce(source, before, after) {
  const at = source.indexOf(before);
  if (at < 0 || at !== source.lastIndexOf(before))
    throw new Error(`Patch de avisos incompatível ou ambíguo: ${before.slice(0, 80)}`);
  return source.replace(before, after);
}

/** Dicas reaparecem ao mudar o modo; a ajuda completa permanece no menu. */
export function showTemporaryControlHint(hint, force = false) {
  if (!hint || (!force && hint.__cleanHintText === hint.textContent)) return;
  hint.__cleanHintText = hint.textContent;
  clearTimeout(hint.__cleanHintTimer);
  hint.hidden = false;
  hint.__cleanHintTimer = setTimeout(() => {
    hint.hidden = true;
  }, 6500);
}

/** Mede apenas avisos visíveis, priorizando conexão e orientação de corrida. */
export function installCleanNoticeStack() {
  const media = matchMedia('(max-width: 760px), (pointer: coarse)');
  const selectors = [
    '#connection',
    '.race-guidance',
    '#toast',
    '.sc-bar',
    '.palanque-live',
    '.peace-zone-badge',
    '.mobile-control-hint',
  ];
  let frame = 0;
  let wasPlaying = false;
  const measured = new WeakSet();
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(layout);
  };
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(queue) : null;
  function topbarBottom(top) {
    for (const bar of document.querySelectorAll('.topbar')) {
      if (!measured.has(bar)) {
        resize?.observe(bar);
        measured.add(bar);
      }
      const style = getComputedStyle(bar);
      if (bar.hidden || style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = bar.getBoundingClientRect();
      if (rect.width && rect.height) top = Math.max(top, rect.bottom + 8);
    }
    return top;
  }
  function layout() {
    frame = 0;
    const playing = document.body.classList.contains('playing');
    if (playing && !wasPlaying)
      document
        .querySelectorAll('.mobile-control-hint')
        .forEach((hint) => showTemporaryControlHint(hint, true));
    wasPlaying = playing;
    // Coordenadas absolutas de viewport já incluem safe-area na barra do cliente.
    let top = 12;
    top = topbarBottom(top);
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (!measured.has(element)) {
          resize?.observe(element);
          measured.add(element);
        }
        if (!media.matches) {
          element.style.removeProperty('--clean-notice-top');
          continue;
        }
        const style = getComputedStyle(element);
        if (
          element.hidden ||
          element.closest('[hidden]') ||
          style.display === 'none' ||
          style.visibility === 'hidden'
        )
          continue;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        element.style.setProperty('--clean-notice-top', `${top}px`);
        top += rect.height + 8;
      }
    }
    document.documentElement.style.setProperty('--clean-notices-end', `${top}px`);
  }
  const relevant = `${selectors.join(', ')}, .topbar`;
  new MutationObserver((records) => {
    // O mundo e os balões mudam a cada frame; só avisos e entrada no jogo afetam esta pilha.
    if (
      records.some(
        (record) =>
          record.target === document.body ||
          record.target.parentElement?.closest(relevant) ||
          record.target.matches?.(relevant) ||
          [...(record.addedNodes || []), ...(record.removedNodes || [])].some(
            (node) => node.matches?.(relevant) || node.querySelector?.(relevant),
          ),
      )
    )
      queue();
  }).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'class'],
  });
  window.addEventListener('resize', queue);
  window.visualViewport?.addEventListener('resize', queue);
  media.addEventListener('change', queue);
  queue();
}

export function applyCleanOverlays(source) {
  if (source.includes('function installCleanNoticeStack()'))
    throw new Error('Patch de avisos incompatível ou ambíguo: já aplicado');
  source = replaceOnce(
    source,
    '      this.buttons.get("garage").setAttribute("aria-label", `Garagem · ${c}`),',
    '      showTemporaryControlHint(this.hint),\n      this.buttons.get("garage").setAttribute("aria-label", `Garagem · ${c}`),',
  );
  source = replaceOnce(
    source,
    '.chat-panel, .map-panel, .location, .race-board, .race-guidance, .mission-current, .palanque-live, .spray-tools, .som-panel, #style-picker',
    '.chat-panel, .map-panel, .location, .race-board, .race-guidance, .mission-current, .palanque-live, .spray-tools, .som-panel, #style-picker, .mobile-control-hint, .mobile-context, .sc-bar, #toast, #connection, .peace-zone-badge',
  );
  return `${source}\n${showTemporaryControlHint.toString()}\n${installCleanNoticeStack.toString()}\ninstallCleanNoticeStack();\n`;
}
