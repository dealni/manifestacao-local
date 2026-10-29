/** Consentimento, alcance e efeitos dos golpes corpo a corpo. */
import { canUsePvp } from './game-permissions.js';
import { isProtected, pathFree } from './attractions.js';
import { now, missionUpdate, inPeaceZone } from './world-state.js';
export const weapons = {
  push: { duration: 640, clip: 'pvp_push' },
  dialogo: { duration: 880, clip: 'pvp_bat' },
  foam: { duration: 1040, clip: 'pvp_foam' },
  pillow: { duration: 760, clip: 'pvp_pillow' },
  fish: { duration: 1000, clip: 'pvp_fish' },
  blades: { duration: 880, clip: 'pvp_bat' },
};
function canHit(player, other, ctx, t) {
  if (
    other === player ||
    other.spectator ||
    !Number.isFinite(other.x) ||
    !Number.isFinite(other.z) ||
    !other.pvp?.on ||
    !canUsePvp(other, ctx) ||
    other.team === player.team ||
    inPeaceZone(other) ||
    isProtected(other, ctx, t)
  )
    return false;
  return Math.hypot(player.x - other.x, player.z - other.z) <= 3.5 && pathFree(player, other, ctx);
}
export function attack(player, ctx) {
  if (
    player.spectator ||
    !Number.isFinite(player.x) ||
    !Number.isFinite(player.z) ||
    !player.pvp?.on ||
    !canUsePvp(player, ctx, player.pvp.weapon) ||
    inPeaceZone(player) ||
    now() < (player.attackAt ?? 0) + 600
  )
    return;
  const t = now();
  player.attackAt = t;
  const actions = [
    {
      id: player.id,
      kind: 'attack',
      weapon: player.pvp.weapon,
      at: t,
      yaw: player.yaw ?? 0,
      strength: 1,
      ...weapons[player.pvp.weapon],
    },
  ];
  for (const other of ctx.players?.values() ?? []) {
    if (!canHit(player, other, ctx, t)) continue;
    actions.push({
      id: other.id,
      kind: 'hit',
      duration: 560,
      clip: 'pvp_hit',
      weapon: player.pvp.weapon,
      at: t,
      yaw: player.yaw ?? 0,
      strength: 1,
      by: player.id,
    });
    missionUpdate(player, ctx, { meleeHits: 1 });
    break;
  }
  ctx.broadcast?.({ t: 'physical', actions });
}
