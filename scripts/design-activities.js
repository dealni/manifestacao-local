function replaceOnce(source, before, after) {
  const index = source.indexOf(before);
  if (index < 0 || source.lastIndexOf(before) !== index)
    throw new Error(`Patch de atividades incompatível ou ambíguo: ${before.slice(0, 90)}`);
  return source.replace(before, after);
}

/** Mantém a posição de teclado durante atualizações de estado, sem capturar outro painel. */
export function keepActivityFocus(panel, render) {
  const active = document.activeElement;
  const available = (element) =>
    !element.disabled &&
    !element.matches?.(':disabled, input[type="hidden"]') &&
    !element.closest?.('[hidden], [inert], [aria-hidden="true"]') &&
    (!element.getClientRects || element.getClientRects().length > 0) &&
    (!document.defaultView?.getComputedStyle ||
      !['hidden', 'collapse'].includes(
        document.defaultView.getComputedStyle(element).visibility,
      )) &&
    !(element.getAttribute?.('tabindex') != null && Number(element.getAttribute('tabindex')) < 0);
  const controls = () =>
    [...panel.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')].filter(
      available,
    );
  const previous = panel.contains(active) ? controls().indexOf(active) : -1;
  const scrollTop = panel.scrollTop;
  const identity = (element) => {
    if (!element) return null;
    const data = element.dataset || {};
    return (
      element.id ||
      data.testid ||
      ['action', 'mode', 'colour', 'size', 'number']
        .map((key) => (Object.hasOwn(data, key) ? `${key}=${data[key]}` : ''))
        .filter(Boolean)
        .join('|') ||
      element.textContent
    );
  };
  const key = identity(active);
  try {
    return render();
  } finally {
    if (
      previous >= 0 &&
      !panel.hidden &&
      (panel.tagName !== 'DIALOG' || panel.open) &&
      !panel.contains(active) &&
      (document.activeElement === document.body || document.activeElement === panel)
    ) {
      const items = controls();
      const target = items.find((element) => identity(element) === key) || items[0];
      target?.focus({ preventScroll: true });
    }
    panel.scrollTop = scrollTop;
  }
}

/** Explica as regras locais sem substituir o status dinâmico da atração. */
export function activityLocalNotice(id) {
  return (
    {
      triplex:
        'Peça um andar e acompanhe a viagem do elevador. Ele para em outro andar e retorna ao térreo; você também pode sair antes.',
      liberty:
        'Entre no desafio cooperativo e golpeie a estátua. Afaste-se das ondas douradas para preservar seus HP. Participantes próximos, com HP e que contribuíram com golpes, recebem fichas ao derrotá-la.',
      'chair-plaza':
        'Mire com o personagem e lance uma cadeira. Requer PvP ativo; atinge jogadores do outro time com PvP ligado, respeitando paredes e proteção. Recarga de 5 segundos.',
      'whale-pool':
        'Observe a baleia em uma sequência de câmera de 12 segundos. Você pode voltar a explorar depois.',
      'tire-camp':
        'Atravesse os portais a pé para visitar a usina ou o visitante extraterrestre. Recarga de 15 segundos.',
      congress:
        'Use 3 fichas fictícias para abrir o portão por 10 segundos. Entre no pátio e examine o cofre para ganhar 5 fichas; o cofre recarrega em 1 minuto.',
      temple:
        'Receba proteção contra golpes e ondas por 10 segundos. O altar recarrega em 1 minuto; recupere HP no supermercado.',
      bank: 'Deposite 1 ficha fictícia para um evento local: bônus de fichas, restauração de HP, proteção temporária ou confete. Recarga de 15 segundos; não há transferência real.',
    }[id] || ''
  );
}

export function applyActivitiesDesign(source) {
  for (const [name, method] of [
    ['tU', 'renderPanel'],
    ['$Y', 'renderPanel'],
    ['GY', 'open'],
  ]) {
    const start = source.indexOf(`class ${name} {`);
    const end = source.indexOf('\nclass ', start + 1);
    if (start < 0) throw new Error(`Classe de atividades ausente: ${name}`);
    const body = source.slice(start, end < 0 ? undefined : end);
    const patched = replaceOnce(
      body,
      `  ${method}() {`,
      `  ${method}() { return __activitiesKeepFocus(this.panel, () => this.__activities_${method}()); }\n  __activities_${method}() {`,
    );
    source = source.slice(0, start) + patched + (end < 0 ? '' : source.slice(end));
  }
  source = replaceOnce(
    source,
    '  function ce() {\n    const de = n.team(),',
    '  function ce() { return __activitiesKeepFocus(K, __activitiesRenderSpray); }\n  function __activitiesRenderSpray() {\n    const de = n.team(),',
  );
  for (const name of ['mode', 'colours', 'sizes']) {
    source = replaceOnce(
      source,
      `class="spray-${name}" role="radiogroup"`,
      `class="spray-${name}" role="group"`,
    );
  }
  source = replaceOnce(
    source,
    'data-size="${kt}" aria-pressed="${kt === we}" title="${Ke}"',
    'data-size="${kt}" aria-pressed="${kt === we}" aria-label="${Ke}" title="${Ke}"',
  );
  source = replaceOnce(
    source,
    'Empurre, bata e derrube qualquer pessoa na avenida. Veículos empurram pessoas e carros; caminhões têm mais força. Sem sangue, HP ou morte. Todos se levantam automaticamente.',
    'Ataques a pé atingem jogadores do outro time que também ativaram o PvP. Veículos empurram pessoas e carros; caminhões têm mais força. Sem sangue, HP ou morte. Todos se levantam automaticamente.',
  );
  source = replaceOnce(
    source,
    's.append(T("p", "mission-note mission-save-state", this.saveStatus()));',
    'const __saveStatus = T("p", "mission-note mission-save-state", this.saveStatus());\n    __saveStatus.setAttribute("role", "status");\n    s.append(__saveStatus);',
  );
  source = replaceOnce(
    source,
    '  showPanel() {\n    ((this.dialog.hidden = !1),',
    '  showPanel() {\n    if (this.dialog.hidden) this.__activitiesOpener = document.activeElement;\n    ((this.dialog.hidden = !1),',
  );
  source = replaceOnce(
    source,
    '  hidePanel() {\n    (this.dialog.contains(document.activeElement)',
    '  hidePanel() {\n    const __returnFocus = this.dialog.contains(document.activeElement);\n    (this.dialog.contains(document.activeElement)',
  );
  source = replaceOnce(
    source,
    '      this.action("browse", { on: !1 }));\n  }\n  async devices()',
    '      this.action("browse", { on: !1 }));\n    if (__returnFocus && this.__activitiesOpener?.isConnected && !this.__activitiesOpener.disabled && !this.__activitiesOpener.closest("[hidden]")) this.__activitiesOpener.focus({ preventScroll: true });\n  }\n  async devices()',
  );
  source = replaceOnce(
    source,
    'Colisões: derrube pessoas; repetir a mesma exige 2 min.',
    'Atropelamentos: conduza um veículo terrestre liberado e em movimento até alguém a pé do outro time. Ambos precisam ter conta, estar com PvP ligado e fora da área de paz; o servidor valida o contato. Repetir a mesma pessoa só conta novamente após 2 minutos.',
  );
  source = replaceOnce(
    source,
    '(this.description.textContent = e.description));',
    '(this.description.textContent = __activitiesLocalNotice(e.id) || e.description));',
  );
  source = replaceOnce(
    source,
    '(h.disabled =\n          e.id === "bank"',
    '(h.disabled =\n          e.id === "chair-plaza" ? (this.progress.ready[e.id] ?? 0) > this.net.serverNow() :\n          e.id === "congress" ? (l.key === "open-gate" ? this.progress.coins < 3 || this.state.gate.until > this.net.serverNow() : !(this.state.gate.openedAt && this.net.serverNow() >= this.state.gate.openedAt + 700 && this.net.serverNow() < this.state.gate.until) || (this.progress.ready.congress ?? 0) > this.net.serverNow()) :\n          e.id === "bank"',
  );
  source = replaceOnce(
    source,
    'l.key === "Escape" && this.open && ((this.open = !1), this.render());',
    'l.key === "Escape" && !l.defaultPrevented && this.open && !document.querySelector("dialog[open]") && (this.panel.contains(document.activeElement) || document.activeElement === this.button) && (l.preventDefault(), (this.open = !1), this.render(), !this.button.hidden && this.button.focus());',
  );
  source = replaceOnce(
    source,
    '(h.disabled =\n          e.id === "chair-plaza"',
    '(h.disabled =\n          this.net.options?.spectate && e.id !== "whale-pool" ? true :\n          e.id === "chair-plaza"',
  );
  source = replaceOnce(
    source,
    '    const c = e.actions.filter(',
    '    if (this.net.options?.spectate && e.id !== "whale-pool") this.status.textContent = "Saia do modo espectador para interagir com esta atração.";\n    const c = e.actions.filter(',
  );
  source = replaceOnce(
    source,
    '(h.onclick = () => {\n          if (e.id === "whale-pool")',
    '(h.onclick = () => {\n          if (h.disabled || (this.net.options?.spectate && e.id !== "whale-pool") || this.net.connected === false) return;\n          if (e.id === "whale-pool")',
  );
  const pvpClaims = source.split('todos os objetos incluídos');
  if (pvpClaims.length !== 4) throw new Error('Descrições do passe PvP incompatíveis');
  source = pvpClaims.join('objetos especiais vendidos separadamente');
  return `const __activitiesKeepFocus = ${keepActivityFocus.toString()};\nconst __activitiesLocalNotice = ${activityLocalNotice.toString()};\n${source}`;
}
