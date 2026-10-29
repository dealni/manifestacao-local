function once(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before))
    throw new Error(`Patch dos controles de som incompatível: ${before.slice(0, 70)}`);
  return source.replace(before, after);
}

/** Retém opções expandidas e a posição de navegação quando o som muda. */
export function keepSoundPanelState(panel, render) {
  const document = panel.ownerDocument;
  const active = document.activeElement;
  const focused = panel.contains(active);
  const scrollTop = panel.scrollTop;
  const details = [...panel.querySelectorAll('details')].map((element) => element.open);
  const controls = () => [...panel.querySelectorAll('button, input, summary, select, textarea')];
  const identity = (element) => {
    if (!element) return '';
    return (
      element.id ||
      ['som', 'somItem', 'somTrack', 'playlist', 'index', 'to', 'yt']
        .filter((key) => Object.hasOwn(element.dataset, key))
        .map((key) => `${key}=${element.dataset[key]}`)
        .join('|') ||
      element.className
    );
  };
  const key = identity(active);
  try {
    return render();
  } finally {
    if (!panel.hidden) {
      panel.querySelectorAll('details').forEach((element, index) => {
        if (index < details.length) element.open = details[index];
      });
      if (
        focused &&
        !panel.contains(active) &&
        (document.activeElement === document.body || document.activeElement === panel)
      ) {
        controls()
          .find((element) => identity(element) === key && !element.disabled)
          ?.focus({ preventScroll: true });
      }
      panel.scrollTop = scrollTop;
    }
  }
}

/** Mostra a dependência real da escuta sem alterar a preferência do microfone. */
export function soundListeningHint(sound) {
  if (!sound.enabled)
    return 'Som geral desligado. Use Ativar som geral para ouvir músicas e vozes.';
  if (sound.debateMuted) return 'O áudio do jogo está temporariamente silenciado durante o debate.';
  if (!sound.voiceOn) return 'Escuta dos palcos desligada. Use Ouvir na linha Voz dos palcos.';
  if (sound.voiceVolume === 0)
    return 'O volume das vozes está em zero. Aumente Voz dos palcos para ouvir.';
  return 'Escuta dos palcos ativada. Você ouve quem fala por perto; para usar seu microfone, use Falar no palco.';
}

/** Mantém os controles nativos no desktop e celular usando somente o catálogo local. */
export function applySoundControlsClient(source) {
  source = once(
    source,
    '<label for="som-palanque">Palanque</label>',
    '<label for="som-palanque">Voz dos palcos</label>',
  );
  source = once(
    source,
    'aria-label="Volume das vozes do palanque"',
    'aria-label="Volume das vozes dos palanques e caminhões"',
  );
  source = once(
    source,
    '          n.sound.musicOn,\n          n.sound.voiceOn,',
    '          n.sound.enabled,\n          n.sound.debateMuted,\n          n.sound.musicOn,\n          n.sound.voiceOn,\n          n.sound.voiceVolume,',
  );
  source = once(
    source,
    '<div class="som-volume"><label for="som-volume">Músicas</label>',
    '<div class="som-volume"><span>Som geral</span><button type="button" id="som-global" data-som-global aria-pressed="${!n.sound.enabled}">${n.sound.enabled ? "Silenciar som geral" : "Ativar som geral"}</button></div><p class="som-lead" role="status">${__soundListeningHint(n.sound)}</p><div class="som-volume"><label for="som-volume">Músicas</label>',
  );
  source = once(
    source,
    '      const V = e.querySelector("#som-volume");',
    '      e.querySelector("[data-som-global]").onclick = () => { document.querySelector("#sound")?.click(); S(!0); };\n      const V = e.querySelector("#som-volume");',
  );
  source = once(
    source,
    '  const S = (B = !1) => {\n      m();',
    '  const S = (B = !1) => __soundKeepPanelState(e, () => {\n      m();',
  );
  source = once(
    source,
    '        i());\n    },\n    E = (B) => {',
    '        i());\n    }),\n    E = (B) => {',
  );
  source = once(
    source,
    '<ol class="som-tracks">${S8(P.team)',
    '<p class="som-lead">Escolha uma música abaixo ou use Próxima. A troca vale para quem estiver por perto.</p><ol class="som-tracks" aria-label="Músicas disponíveis para o seu equipamento">${S8(P.team)',
  );
  source = once(
    source,
    '      const P = n.system.mine();\n      B === "stop"',
    '      const P = n.system.mine();\n      if (B !== "stop" && (!P || P.stageMuted)) return;\n      B === "stop"',
  );
  source = once(
    source,
    'P && n.system.play(P.track ?? S8(P.team)[0].id);',
    'P && S8(P.team).length && n.system.play($2(P.track)?.team === P.team ? P.track : S8(P.team)[0].id);',
  );
  // O painel e o mini player são botões nativos, utilizáveis por toque e teclado.
  const button = 'data-som="next" aria-label="Próxima música"';
  if (source.split(button).length !== 3)
    throw new Error('Esperados os dois controles de próxima música');
  return `const __soundListeningHint = ${soundListeningHint.toString()};\nconst __soundKeepPanelState = ${keepSoundPanelState.toString()};\n${source.replaceAll(
    button,
    'data-som="next" aria-label="Próxima música" ${P.stageMuted || S8(P.team).length < 2 ? "disabled" : ""}',
  )}`;
}
