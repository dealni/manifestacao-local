/** Reduz a disputa do cenário com áudio e toque no perfil automático móvel. */
export function mobileGraphicsProfile(profile) {
  return {
    ...profile,
    pixelRatio: Math.min(1, profile.pixelRatio),
    maxFps: Math.min(30, profile.maxFps),
    animationFps: Math.min(30, profile.animationFps),
    effects: Math.min(0.55, profile.effects),
  };
}

export function applyMobilePerformance(source) {
  const before = ': LE(n === "auto" ? s.tier : iU[n], e, t, i, a);';
  const initialFps = '  gd = 60,',
    statusFps = '${i ? ` · ${Math.round(i)} FPS` : ""}';
  if (
    source.includes('const __mobileGraphicsProfile =') ||
    [before, initialFps, statusFps].some(
      (anchor) =>
        source.indexOf(anchor) < 0 || source.indexOf(anchor) !== source.lastIndexOf(anchor),
    )
  )
    throw new Error('Perfil gráfico móvel incompatível ou já aplicado');
  return (
    `const __mobileGraphicsProfile = ${mobileGraphicsProfile.toString()};\n` +
    source
      .replace(
        before,
        ': n === "auto" && e ? __mobileGraphicsProfile(LE(s.tier, e, t, i, a)) : LE(n === "auto" ? s.tier : iU[n], e, t, i, a);',
      )
      .replace(initialFps, '  gd = 0,')
      .replace(
        statusFps,
        '${t.maxFps ? ` · limite de ${t.maxFps} FPS` : ""}${i ? ` · ${Math.round(i)} FPS medidos` : " · aguardando medição"}',
      )
  );
}
