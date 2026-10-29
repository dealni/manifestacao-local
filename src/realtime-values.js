export const clamp = (value, min, max, fallback = 0) =>
  Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;

export const cleanNick = (value) =>
  String(value || 'Visitante')
    // eslint-disable-next-line no-control-regex -- Remove ou rejeita controles ASCII recebidos do usuário.
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 20) || 'Visitante';
