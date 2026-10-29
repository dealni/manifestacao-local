function replaceOnce(source, before, after) {
  const at = source.indexOf(before);
  if (at < 0 || at !== source.lastIndexOf(before)) {
    throw new Error(`Patch de HUD incompatível ou ambíguo: ${before.slice(0, 80)}`);
  }
  return source.replace(before, after);
}

/** O acionador de uma subpágina pode ter sido removido ao reconstruir o menu. */
export function restoreMobileHudFocus(menu, document) {
  // close é enfileirado: o mesmo diálogo pode ter sido reaberto antes do evento.
  // Nesse caso, preserve também os estados visual e acessível da nova abertura.
  if (menu.sheet.open) return;
  menu.buttons
    .get(menu.page === 'map' ? 'menu' : menu.page)
    ?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('mobile-menu-open');
  menu.restoreMap();
  const focused = document.activeElement;
  if (
    menu.active &&
    (focused === document.body || menu.sheet.contains(focused)) &&
    !document.querySelector('dialog[open]')
  ) {
    menu.buttons.get(menu.page === 'map' ? 'menu' : menu.page)?.focus({ preventScroll: true });
  }
}

/** Semântica e falhas dos controles preservadas na geração reproduzível. */
export function applyHudDesign(source) {
  source = replaceOnce(
    source,
    's.setAttribute("aria-label", "Câmera e missão atual"));',
    's.setAttribute("aria-label", "Câmera"));',
  );
  source = replaceOnce(
    source,
    'Y1.setAttribute("aria-label", "Corrida e missão atual");',
    'Y1.setAttribute("aria-label", "Atividades do jogo");',
  );
  source = replaceOnce(
    source,
    'pe("#hud-tools").append(Y1);',
    'const __activitiesOptions = pe("#graphics-options");\n__activitiesOptions.append(T("h3", "", "Atividades"), Y1);\nY1.addEventListener("click", event => { if (event.target.closest("button")) __activitiesOptions.close(); }, true);',
  );
  for (const control of ['card', 'badge']) {
    source = replaceOnce(
      source,
      `this.panel.addEventListener("close", () => this.${control}.focus()),`,
      'this.panel.addEventListener("close", () => { if (this.panel.open || document.querySelector("dialog[open]")) return; const trigger = document.body.classList.contains("mobile-hud") ? document.querySelector("[data-mobile=menu]") : document.querySelector("#options"); trigger?.focus(); }),',
    );
  }
  source = replaceOnce(
    source,
    'pe("#sound").onclick = () => {',
    'pe("#sound").setAttribute("aria-pressed", String(!dn.enabled));\npe("#sound").onclick = () => {',
  );
  source = replaceOnce(
    source,
    '      dn.enabled ? "Silenciar áudio" : "Ativar áudio",\n    ));',
    '      dn.enabled ? "Silenciar áudio" : "Ativar áudio",\n    ));\n  pe("#sound").setAttribute("aria-pressed", String(!dn.enabled));\n  if (!dn.enabled) return;\n  try { return Promise.resolve(dn.unlock()).catch(() => Cn("Não foi possível ativar o áudio. Desligue e ative o som novamente para tentar.")); } catch { Cn("Não foi possível ativar o áudio. Desligue e ative o som novamente para tentar."); }',
  );
  source = replaceOnce(
    source,
    `pe("#fullscreen").onclick = () => {
  document.fullscreenElement
    ? document.exitFullscreen?.()
    : L4 &&
      Promise.resolve()
        .then(() => L4())
        .catch(() => Cn("Tela cheia indisponível neste navegador."));
};`,
    `function __hudFullscreenSync() {
  const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
  pe("#fullscreen").setAttribute("aria-pressed", String(active));
  pe("#fullscreen").setAttribute("aria-label", active ? "Sair da tela cheia" : "Tela cheia");
  pe("#fullscreen").title = active ? "Sair da tela cheia" : "Tela cheia";
}
document.addEventListener("fullscreenchange", __hudFullscreenSync);
document.addEventListener("webkitfullscreenchange", __hudFullscreenSync);
__hudFullscreenSync();
pe("#fullscreen").onclick = () => {
  const active = document.fullscreenElement || document.webkitFullscreenElement;
  const action = active
    ? (document.exitFullscreen || document.webkitExitFullscreen)?.bind(document)
    : L4;
  if (!action) return;
  // Execute durante a ativação do usuário, necessária em Safari/iOS.
  try {
    return Promise.resolve(action()).catch(() => Cn("Tela cheia indisponível neste navegador."));
  } catch {
    Cn("Tela cheia indisponível neste navegador.");
  }
};`,
  );
  source = replaceOnce(
    source,
    '      i.classList.toggle("active", e.classList.contains("active")),\n      (i.onclick = () => this.invoke(() => e.click())),',
    '      i.classList.toggle("active", e.classList.contains("active")),\n      e.hasAttribute("aria-pressed") && i.setAttribute("aria-pressed", e.getAttribute("aria-pressed")),\n      (i.onclick = () => this.invoke(() => e.click())),',
  );
  source = replaceOnce(
    source,
    '              : i.id === "fullscreen"\n                ? "Tela cheia"',
    '              : i.id === "fullscreen"\n                ? (i.getAttribute("aria-label") ?? "Tela cheia")',
  );
  source = replaceOnce(
    source,
    '        document.activeElement.blur());',
    '        this.buttons.get("chat").focus({ preventScroll: true }));',
  );
  source = replaceOnce(
    source,
    '  render() {\n    if (\n      (this.content.replaceChildren(),',
    `  restoreMap() {
    if (!this.mobileMapHome) return;
    const map = document.querySelector(".map-panel");
    if (map) this.mobileMapHome.after(map);
    this.mobileMapHome.remove();
    this.mobileMapHome = null;
  }
  render() {
    this.restoreMap();
    if (this.page === "map") {
      this.content.replaceChildren();
      this.title.textContent = "Mapa da avenida";
      const map = document.querySelector(".map-panel");
      if (map) {
        this.mobileMapHome = document.createComment("mobile-map-home");
        map.before(this.mobileMapHome);
        this.content.append(map);
      }
      return;
    }
    if (
      (this.content.replaceChildren(),`,
  );
  source = replaceOnce(
    source,
    '(this.buttons.get(this.page)?.setAttribute("aria-expanded", "false"),\n          document.body.classList.remove("mobile-menu-open"));',
    `(${restoreMobileHudFocus.toString()})(this, document);`,
  );
  source = replaceOnce(
    source,
    '    } else {\n      for (const i of this.opts.topActions.querySelectorAll("button")) {',
    `    } else {
      const mapAction = T("button", "mobile-menu-action", "Mapa da avenida");
      mapAction.type = "button";
      mapAction.dataset.mobileAction = "map";
      mapAction.onclick = () => this.open("map");
      e.append(mapAction);
      const activitiesAction = T("button", "mobile-menu-action", "Atividades · missões e corrida");
      activitiesAction.type = "button";
      activitiesAction.dataset.mobileAction = "activities";
      activitiesAction.onclick = () => this.invoke(() => {
        document.querySelector("#options")?.click();
        document.querySelector("#graphics-options .game-activities")?.scrollIntoView({ block: "center" });
      });
      e.append(activitiesAction);
      for (const i of this.opts.topActions.querySelectorAll("button")) {`,
  );
  source = replaceOnce(
    source,
    'this.buttons.get(e)?.setAttribute("aria-expanded", "true")',
    'this.buttons.get(e === "map" ? "menu" : e)?.setAttribute("aria-expanded", "true")',
  );
  return applySkinPreviewMotion(source);
}

export function applySkinPreviewMotion(source) {
  source = replaceOnce(
    source,
    '      (n.actors.want(v), m.pose("idle"), m.showcase(-0.2, 0.15));\n      let w = performance.now();',
    '      (n.actors.want(v), m.pose("idle"), m.showcase(-0.2, 0.15));\n      const __skinPreviewMotion = matchMedia("(prefers-reduced-motion: reduce)");\n      let w = performance.now();',
  );
  source = replaceOnce(
    source,
    '          m.render(Math.min(0.05, (M - w) / 1e3)),',
    '          m.render(__skinPreviewMotion.matches ? 0 : Math.min(0.05, (M - w) / 1e3)),',
  );
  return source;
}
