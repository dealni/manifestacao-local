/** Mecânicas locais das atrações usando os estados e animações públicos. */
export { isProtected, relocateWorldPlayer, pathFree } from './attraction-common.js';
export { attractionAction } from './attraction-actions.js';
export { tickAttractions } from './attraction-tick.js';

export function cleanupAttractions(player, ctx) {
  const s = ctx.state.world?.secret;
  if (!s) return;
  const riding = player.secretRide || s.rides.some((r) => r.owner === player.id);
  s.rides = s.rides.filter((r) => r.owner !== player.id);
  s.wards = s.wards.filter((w) => w.owner !== player.id);
  s.chairs = s.chairs.filter((c) => c.owner !== player.id);
  ctx.localWorld?.bossParticipants?.delete(player.id);
  ctx.localWorld?.bossContributors?.delete(player.id);
  ctx.localWorld?.bossWave?.hits.delete(player.id);
  if (riding) {
    player.secretRide = false;
    Object.assign(player, {
      x: 226,
      z: -112.5,
      speed: 0,
      input: { x: 0, z: 0, run: false },
      worldPrevious: { x: 226, z: -112.5, at: Date.now() },
    });
  }
  ctx.save();
  ctx.broadcast?.({ t: 'secret_places', ...s });
}
