import {
  stageVoicePersonal,
  refreshStageVoice,
  setStageVoiceWanted,
  setStageVoiceMonitor,
  stopStageVoice,
  handleStageDeck,
  leaveStageDeck,
} from './stage-voice.js';
import { cleanupDebate } from './debate.js';
import { relocateWorldPlayer } from './attractions.js';
import { canUsePvp, playerEntitlements } from './game-permissions.js';
import { missionUpdate, physical, now, clamp, send, notice } from './world-state.js';
import { secret } from './world-secret.js';
import { attack, weapons } from './world-combat.js';
import { sound } from './world-sound.js';
function handleMissions(player, msg, ctx) {
  missionUpdate(player, ctx);
  return true;
}
function handleSecretPlace(player, msg, ctx) {
  secret(player, msg, ctx);
  return true;
}
function handlePvp(player, msg, ctx) {
  const weapon = Object.hasOwn(weapons, msg.weapon) ? msg.weapon : 'push';
  const owned = canUsePvp(player, ctx, weapon);
  player.pvp = { on: !!msg.on && owned && !player.spectator, weapon: owned ? weapon : 'push' };
  if (msg.on && !owned) notice(ctx, player, 'Desbloqueie o PvP e este objeto com pontos na loja.');
  send(ctx, player, {
    t: 'pvp',
    me: { owned: playerEntitlements(player, ctx).pvp, ...player.pvp },
  });
  ctx.broadcast?.({ t: 'physical_state', members: physical(ctx, player).members, actions: [] });
  return true;
}
function handleAttack(player, msg, ctx) {
  attack(player, ctx);
  return true;
}
function handleSom(player, msg, ctx) {
  if (typeof msg.a === 'string') sound(player, msg, ctx);
  return true;
}
function handleGlitter(player, msg, ctx) {
  if (player.spectator) return true;
  const g = ctx.localWorld.glitter,
    t = now();
  if (msg.action === 'drop' && (player.glitterReady ?? 0) <= t) {
    player.glitterReady = t + 10000;
    g.drops = g.drops.filter((d) => d.until > t);
    g.drops.push({
      id: t,
      owner: player.id,
      team: player.team ?? 0,
      x: player.x,
      z: player.z,
      y: 12,
      ground: 0,
      vx: 0,
      vz: 0,
      at: t,
      landAt: t + 1564,
      until: t + 10000,
    });
    g.stains = [...(ctx.players?.values() ?? [])]
      .filter((p) => Math.hypot(p.x - player.x, p.z - player.z) < 12)
      .map((p) => ({ id: p.id, team: player.team ?? 0, at: t + 1564, until: t + 15000 }));
    ctx.broadcast?.({ t: 'glitter', ...g });
  }
  return true;
}
function handleBakery(player, msg, ctx) {
  if (player.spectator) return true;
  const b = ctx.localWorld.bakery,
    t = now();
  if (msg.action === 'fire' && b.readyAt < t && Math.hypot(player.x - 191.6, player.z - 2.4) < 7) {
    b.readyAt = t + 30000;
    b.shots = [
      {
        id: t,
        owner: player.id,
        at: t,
        impactAt: t + 3800,
        until: t + 16000,
        from: { x: 190, y: 10, z: 3.4 },
        to: { x: 190, y: 15, z: -180 },
        yaw: Math.PI,
        targetTeam: player.team === 1 ? 0 : 1,
        hit: true,
      },
    ];
    ctx.broadcast?.({ t: 'bakery', ...b });
  }
  return true;
}
function handlePalanqueIr(player, msg, ctx) {
  if (player.secretRide) {
    notice(ctx, player, 'Saia do elevador antes de ir ao palanque.');
    return true;
  }
  cleanupDebate(player, ctx);
  leaveStageDeck(player, ctx);
  player.mode = 0;
  player.vehicle = 0;
  const positions = [
      [-18.2, -43.5],
      [18.2, -43.5],
      [18.2, -9],
    ],
    pos = positions[player.team ?? 0] ?? positions[0];
  relocateWorldPlayer(player, ctx, pos[0], pos[1]);
  refreshStageVoice(ctx);
  return true;
}
function handlePalanqueMonitor(player, msg, ctx) {
  setStageVoiceMonitor(player, msg.on, ctx);
  return true;
}
function handlePalanqueStop(player, msg, ctx) {
  stopStageVoice(player, ctx);
  return true;
}
function handlePalanqueEnter(player, msg, ctx) {
  if (msg.on === false) stopStageVoice(player, ctx);
  const personal = stageVoicePersonal(player, ctx);
  send(ctx, player, personal);
  if (msg.on && !personal.may)
    notice(
      ctx,
      player,
      personal.busy
        ? 'O microfone está ocupado. Aguarde a pessoa terminar.'
        : 'Suba no palanque ou no palco do caminhão de som para falar.',
    );
  return true;
}
function handleVoz(player, msg, ctx) {
  setStageVoiceWanted(player, msg.on, ctx);
  return true;
}
function handleDeck(player, msg, ctx) {
  if (msg.on === true && player.vehicleSeat) ctx.releaseVehicleSeats?.(player);
  const handled = handleStageDeck(player, msg.on === true, ctx);
  if (msg.on === true && player.stageDeck) cleanupDebate(player, ctx);
  return handled;
}
function handleTruck(player, msg, ctx) {
  send(ctx, player, stageVoicePersonal(player, ctx));
  return true;
}
function handleRoadster(player, msg, _ctx) {
  if (msg.a === 'roll') player.rocketRoll = clamp(msg.roll, -1, 1);
  return false;
}

export const worldMessageHandlers = {
  missions: handleMissions,
  secret_place: handleSecretPlace,
  pvp: handlePvp,
  attack: handleAttack,
  som: handleSom,
  glitter: handleGlitter,
  bakery: handleBakery,
  palanque_ir: handlePalanqueIr,
  palanque_monitor: handlePalanqueMonitor,
  palanque_stop: handlePalanqueStop,
  palanque_enter: handlePalanqueEnter,
  voz: handleVoz,
  deck: handleDeck,
  truck: handleTruck,
  roadster: handleRoadster,
};
