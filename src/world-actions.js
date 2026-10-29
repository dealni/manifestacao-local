import { worldMessageHandlers } from './world-message-handlers.js';
import { stageVoicePersonal, stopStageVoice } from './stage-voice.js';
import { tickAttractions, cleanupAttractions } from './attractions.js';
import { detectVehicleHits } from './vehicle-hits.js';
import { playerUser } from './game-permissions.js';
import {
  world,
  progress,
  missionUpdate,
  now,
  send,
  paintState,
  creditActivity,
  places,
} from './world-state.js';
import { paint } from './world-paint.js';
import { syncPlayerSound } from './world-sound.js';
export { syncPlayerSound } from './world-sound.js';
export { initWorld, transferWorldProgress } from './world-state.js';
export function handleWorldMessage(player, msg, ctx) {
  if (!msg || typeof msg.t !== 'string') return false;
  world(ctx);
  if (msg.t.startsWith('px')) {
    paint(player, msg, ctx);
    return true;
  }
  const handler = Object.hasOwn(worldMessageHandlers, msg.t) ? worldMessageHandlers[msg.t] : null;
  return handler ? handler(player, msg, ctx) : false;
}
export function worldVehicleTick(player, ctx) {
  const hits = detectVehicleHits(player, ctx);
  if (!hits.length) return;
  ctx.broadcast?.({ t: 'physical', actions: hits });
  const history = (progress(player, ctx).vehicleHitTargets ??= {});
  const at = now();
  for (const [key, last] of Object.entries(history))
    if (!Number.isFinite(last) || at - last >= 120000) delete history[key];
  let credit = 0;
  for (const hit of hits) {
    const target = ctx.players?.get(hit.id),
      user = target && playerUser(target, ctx);
    if (!user) continue;
    const key = `user:${user.id}`;
    if (Object.hasOwn(history, key)) continue;
    history[key] = at;
    credit++;
  }
  if (credit) {
    missionUpdate(player, ctx, { vehicleHits: credit });
    if (ctx.saveProgress) ctx.saveProgress();
    else ctx.save();
  }
}
export function worldTick(player, ctx) {
  syncPlayerSound(player, ctx);
  tickAttractions(player, ctx, progress);
  const t = now(),
    last = player.worldPrevious;
  if (
    last &&
    !player.spectator &&
    !player.vehicleSeat &&
    !player.stageDeck &&
    player.mode !== 32 &&
    player.mode !== 33
  ) {
    const distance = Math.hypot(player.x - last.x, player.z - last.z);
    if (distance > 0.05 && distance < 150) {
      const mission = progress(player, ctx).mission,
        start = Math.max(last.at, t - 2000);
      const dt = creditActivity(mission, start, t);
      missionUpdate(player, ctx, { [player.mode > 0 ? 'drive' : 'walk']: distance, activeMs: dt });
      if (t - (player.worldSavedAt ?? 0) > 10000) {
        if (ctx.saveProgress) ctx.saveProgress();
        else ctx.save();
        player.worldSavedAt = t;
      }
    }
  }
  player.worldPrevious = { x: player.x, z: player.z, at: t };
  if (!player.worldInitialized) {
    player.worldInitialized = true;
    send(ctx, player, paintState(ctx));
    send(ctx, player, stageVoicePersonal(player, ctx));
  }
}
export async function handleWorldHttp(req, res, url, ctx) {
  if (url.pathname === '/api/local/world' && req.method === 'GET') {
    ctx.send(res, 200, {
      local: true,
      paintTiles: Object.keys(world(ctx).paint).length,
      places: places.map(({ id, name, x, z, actions }) => ({ id, name, x, z, actions })),
      rules: 'Regras locais novas; sem acesso ao backend original.',
    });
    return true;
  }
  return false;
}

export function onPlayerLeave(player, ctx) {
  stopStageVoice(player, ctx);
  if (ctx.localWorld?.sounds.delete(player.id)) ctx.broadcast?.({ t: 'som_off', p: player.id });
  cleanupAttractions(player, ctx);
}
