function replaceOnce(source, before, after) {
  const first = source.indexOf(before);
  if (first < 0 || first !== source.lastIndexOf(before)) {
    throw new Error(`Patch de design incompatível ou ambíguo: ${before.slice(0, 100)}`);
  }
  return source.replace(before, after);
}

/** Mantém os ajustes semânticos no processo reproduzível de geração do cliente. */
export function applyDesignClient(source) {
  source = replaceOnce(
    source,
    '<input id="nickname" name="nickname" required',
    '<input id="nickname" name="nickname" aria-describedby="nickname_hint" required',
  );
  source = replaceOnce(
    source,
    '<p class="nick-hint">De 2 a 12 caracteres.',
    '<p id="nickname_hint" class="nick-hint">De 2 a 12 caracteres.',
  );
  const nicknameStart = source.indexOf('   <label class="input-label" id="nickname-label"');
  const nicknameEnd = source.indexOf('\n  </form>', nicknameStart);
  const actionsStart = source.indexOf('   <div class="entry-actions">');
  const actionsEnd = source.indexOf('\n', actionsStart);
  if (
    nicknameStart < 0 ||
    nicknameEnd < nicknameStart ||
    actionsStart < 0 ||
    actionsEnd < actionsStart
  )
    throw new Error('Patch de entrada incompatível: apelido ou ações ausentes.');
  const nickname = source
    .slice(nicknameStart, nicknameEnd)
    .replace('name="nickname"', 'name="nickname" form="join-form"');
  const actions = source.slice(actionsStart, actionsEnd);
  source = replaceOnce(source, source.slice(nicknameStart, nicknameEnd), '');
  source = replaceOnce(source, actions, '');
  source = replaceOnce(
    source,
    '  <section class="entry-card" aria-labelledby="entry-title">',
    `  <section class="entry-launch" aria-labelledby="entry-launch-title">
   <div class="entry-launch-copy"><p class="eyebrow">GRÁTIS · DIRETO NO NAVEGADOR</p><h1 id="entry-launch-title">Entre na avenida</h1><p>Escolha um apelido para jogar com seu time. Você pode ajustar seu visual abaixo.</p></div>
   <div class="entry-launch-fields">${nickname}</div>
   ${actions}
  </section>
  <section class="entry-card" aria-labelledby="entry-title">`,
  );
  source = replaceOnce(
    source,
    'cy({ card: pe("#join-form"), before: pe("#nickname-label"), nick: In });',
    'cy({ card: pe(".entry-launch"), before: null, nick: In });',
  );
  source = replaceOnce(source, 'alt="${yf[e]}"', 'alt=""');
  source = replaceOnce(
    source,
    '<span class="checkmark">✓</span>',
    '<span class="checkmark" aria-hidden="true">✓</span>',
  );
  const swatchMarker = '<span class="look-swatch';
  if (source.split(swatchMarker).length !== 4)
    throw new Error('Patch de design incompatível: esperadas três variantes de amostras visuais.');
  source = source.replaceAll(swatchMarker, '<span aria-hidden="true" class="look-swatch');
  source = replaceOnce(
    source,
    '<h1>A sua presença.<br>Do seu jeito.</h1>',
    '<h2>A sua presença.<br>Do seu jeito.</h2>',
  );
  source = replaceOnce(
    source,
    '<p class="eyebrow">01 / ESCOLHA SEU TIME</p><h2 id="team-title">De que lado você está?</h2>',
    '<p class="eyebrow">PERSONALIZE SUA EXPERIÊNCIA</p><h2 id="team-title">Escolha seu time</h2>',
  );
  source = replaceOnce(source, '02 / MONTE SEU VISUAL', 'SEU PERSONAGEM');
  source = replaceOnce(
    source,
    'Escolha seu time, monte seu visual e entre grátis. Você pode jogar sem criar uma conta.',
    'Escolha um personagem e ajuste seu visual. Você também pode começar com a seleção atual.',
  );
  source = replaceOnce(source, ': "Entrar na manifestação"', ': "Iniciar partida"');
  source = replaceOnce(
    source,
    '<button data-channel="global" class="active">Avenida</button><button data-channel="local">Por perto</button>',
    '<button type="button" data-channel="global" class="active" aria-pressed="true">Avenida</button><button type="button" data-channel="local" aria-pressed="false">Por perto</button>',
  );
  source = replaceOnce(
    source,
    '.forEach((e) => e.classList.toggle("active", e === n)));',
    '.forEach((e) => { e.classList.toggle("active", e === n); e.setAttribute("aria-pressed", String(e === n)); }));',
  );
  source = replaceOnce(
    source,
    '  let r = 0.7,\n    c;',
    '  const __previewMotion = matchMedia("(prefers-reduced-motion: reduce)");\n  let r = 0.7,\n    c;',
  );
  source = replaceOnce(
    source,
    '      (A.key === "ArrowLeft" && (r += 0.2),\n        A.key === "ArrowRight" && (r -= 0.2));',
    '      if (A.key !== "ArrowLeft" && A.key !== "ArrowRight") return;\n      A.preventDefault();\n      r += A.key === "ArrowLeft" ? 0.2 : -0.2;',
  );
  source = replaceOnce(
    source,
    '((l = A), c === void 0 && (r += u * 0.25));',
    '((l = A), c === void 0 && !__previewMotion.matches && (r += u * 0.25));',
  );
  source = replaceOnce(
    source,
    '        n.animate?.(u),\n        a.render(s, o),',
    '        !__previewMotion.matches && n.animate?.(u),\n        a.render(s, o),',
  );
  source = replaceOnce(
    source,
    'function ii(n, ...e) {\n  Gi ||',
    'function ii(n, ...e) {\n  const __restoreDialogFocus = Gi?.open && (Gi.contains(document.activeElement) || (document.activeElement === document.body && document.querySelectorAll("dialog[open]").length === 1));\n  Gi ||',
  );
  source = replaceOnce(
    source,
    '    Gi.open || Gi.showModal());\n}\nfunction ro()',
    '    Gi.open || Gi.showModal());\n  if (__restoreDialogFocus && (document.activeElement === document.body || document.activeElement === Gi)) {\n    const heading = Gi.querySelector("h2, h3") || i;\n    heading.tabIndex = -1;\n    heading.focus({ preventScroll: true });\n  }\n}\nfunction ro()',
  );
  return source;
}
