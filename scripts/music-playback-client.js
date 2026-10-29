/** Evita iniciar outra correção enquanto a reprodução ainda não pode acompanhá-la. */
export function applyMusicPlaybackClient(source) {
  const before = '    if (a - e.checked < 500 || e.el.readyState < 1) return;';
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error('Patch de reprodução de música incompatível ou ambíguo');
  }
  const threshold = '    Math.abs(Uk(e.el.currentTime, s, i)) > Gk &&';
  if (!source.includes(threshold) || source.indexOf(threshold) !== source.lastIndexOf(threshold))
    throw new Error('Tolerância de reprodução de música incompatível ou ambígua');
  const loading = '    const o = ci(t),\n      r = () => {',
    ready = '        ((e.el.currentTime = (k8(a, this.net.serverNow(), s) + dw) % s),';
  const reuse = '    e.el.src.endsWith(o)',
    release = '    (e.shape(0, 18e3, 0, 0.08), (e.owner = 0), (e.releasing = t + 0.4));';
  for (const anchor of [loading, ready, reuse, release])
    if (!source.includes(anchor) || source.indexOf(anchor) !== source.lastIndexOf(anchor))
      throw new Error('Carregamento de música incompatível ou ambíguo');
  return source
    .replace(
      before,
      `    if (
      a - e.checked < 500 ||
      e.musicLoading ||
      e.el.seeking ||
      e.el.readyState < 3 ||
      this.sound.audioContext?.state !== "running"
    ) return;`,
    )
    .replace(
      threshold,
      // No WebKit/iOS o relógio da mídia ligada ao Web Audio pode ficar ~350 ms
      // atrás sem acumular atraso. Perseguir esse desvio causava buscas a cada segundo.
      '    Math.abs(Uk(e.el.currentTime, s, i)) > (Tn.os === "ios" ? 1 : Gk) &&',
    )
    .replace(
      loading,
      '    e.musicLoading = true;\n    const __musicLoad = e.musicLoad = (e.musicLoad ?? 0) + 1;\n' +
        loading +
        '\n        if (e.musicLoad !== __musicLoad) return;',
    )
    .replace(reuse, '    e.el.src.endsWith(o) && e.el.readyState >= 1')
    .replace(
      release,
      '    e.musicLoad = (e.musicLoad ?? 0) + 1;\n    e.musicLoading = false;\n' + release,
    )
    .replace(ready, '        e.musicLoading = false;\n' + ready);
}
