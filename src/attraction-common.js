/** Mecânicas locais das atrações usando os estados e animações públicos. */
import { canOccupy } from './simulation.js';
export const tell = (ctx, p, text) => ctx.sendPlayer?.(p, { t: 'notice', text });
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const peace = (p) => p.x >= -106.5 && p.x <= 28 && p.z >= -72.35 && p.z <= 16.4;
export const isProtected = (p, ctx, t = Date.now()) =>
  !!ctx.state.world?.secret?.wards.some((w) => w.owner === p.id && w.until > t);
export function relocateWorldPlayer(p, ctx, x, z, t = Date.now()) {
  ctx.releaseVehicleSeats?.(p);
  Object.assign(p, {
    x,
    z,
    speed: 0,
    input: { x: 0, z: 0, run: false },
    worldPrevious: { x, z, at: t },
  });
  // Teleportes não percorrem o segmento entre a pose anterior e o destino.
  // O jogador pode voltar ao veículo antes do próximo tick da corrida.
  for (const row of ctx.race?.rows ?? []) {
    if (row.id !== p.id) continue;
    row.lastX = x;
    row.lastZ = z;
  }
  ctx.sendPlayer?.(p, { t: 'relocate', x, z, yaw: p.yaw ?? 0, at: t >>> 0 });
}
export function effect(s, p, kind, t) {
  s.effects.push({ id: `${p.id}:${t}:${kind}`, kind, x: p.x, z: p.z, at: t });
  s.effects = s.effects.slice(-32);
}
export function ward(s, p, t) {
  s.wards = s.wards.filter((w) => w.owner !== p.id);
  s.wards.push({ owner: p.id, until: t + 10000 });
  effect(s, p, 'shield', t);
}
export function emitProgress(ctx, p, progress) {
  ctx.sendPlayer?.(p, { t: 'secret_progress', ...progress(p, ctx).secret });
}
export function pathFree(a, b, ctx) {
  const n = Math.max(1, Math.ceil(distance(a, b) / 0.2));
  for (let i = 0; i <= n; i++)
    if (!canOccupy(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n, 0.08, ctx))
      return false;
  return true;
}
