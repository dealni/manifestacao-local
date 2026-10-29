import { canOccupy } from './simulation.js';
import { canUsePvp } from './game-permissions.js';
import {
  tell,
  distance,
  peace,
  relocateWorldPlayer,
  effect,
  ward,
  emitProgress,
} from './attraction-common.js';
function actionTriplex(player, msg, ctx, place, p, progress, t, s) {
  const ride = s.rides.find((r) => r.place === place.id && r.until > t);
  if (msg.action === 'leave-ride') {
    if (ride?.owner === player.id) {
      s.rides = s.rides.filter((r) => r !== ride);
      player.secretRide = false;
      relocateWorldPlayer(player, ctx, 226, -112.5, t);
    }
    return true;
  }
  if (ride) {
    tell(ctx, player, 'Elevador ocupado. Aguarde a volta ao térreo.');
    return true;
  }
  if (player.mode > 0 || player.race) {
    tell(ctx, player, 'Desça do veículo para entrar no elevador.');
    return true;
  }
  const requested = Number(msg.action.slice(5)),
    actual = { 3: 6, 6: 9, 9: 3 }[requested];
  if (!actual) return true;
  s.rides.push({
    owner: player.id,
    place: place.id,
    requested,
    actual,
    x: 226,
    z: -115.5,
    ground: 0.15,
    at: t,
    until: t + 6500,
  });
  player.secretRide = true;
  relocateWorldPlayer(player, ctx, 226, -115.5, t);
  return true;
}
function actionTemple(player, msg, ctx, place, p, progress, t, s) {
  if (p.templeReadyAt <= t) {
    p.templeReadyAt = t + 60000;
    ward(s, player, t);
  }
  return true;
}
function actionSupermarket(player, msg, ctx, place, p, progress, t, s) {
  if ((p.ready[place.id] ?? 0) <= t && p.hp < 100) {
    p.hp = 100;
    p.ready[place.id] = t + 60000;
    effect(s, player, 'heal', t);
  }
  return true;
}
function actionTireCamp(player, msg, ctx, place, p, progress, t, s) {
  if ((p.ready[place.id] ?? 0) > t) return true;
  if (player.mode > 0 || player.race) {
    tell(ctx, player, 'Desça do veículo para atravessar o portal.');
    return true;
  }
  const target = msg.action === 'travel-north' ? { x: 216, z: -529 } : { x: 214, z: 189 };
  if (!canOccupy(target.x, target.z, 0.4, ctx)) {
    tell(ctx, player, 'A saída do portal está ocupada. Tente novamente.');
    return true;
  }
  p.ready[place.id] = t + 15000;
  relocateWorldPlayer(player, ctx, target.x, target.z, t);
  effect(s, player, 'confetti', t);
  return true;
}
function actionBank(player, msg, ctx, place, p, progress, t, s) {
  if (p.coins < 1 || (p.ready.bank ?? 0) > t) return true;
  p.coins--;
  p.ready.bank = t + 15000;
  const result = Math.floor((ctx.random?.() ?? Math.random()) * 4);
  if (result === 0) {
    p.coins += 3;
    effect(s, player, 'coins', t);
    tell(ctx, player, 'Evento local: bônus de 3 fichas fictícias.');
  } else if (result === 1) {
    p.hp = 100;
    effect(s, player, 'heal', t);
    tell(ctx, player, 'Evento local: HP dos desafios restaurados.');
  } else if (result === 2) {
    ward(s, player, t);
    tell(ctx, player, 'Evento local: proteção por 10 segundos.');
  } else {
    effect(s, player, 'confetti', t);
    tell(ctx, player, 'Evento local: chuva de confete.');
  }
  return true;
}
function actionCongress(player, msg, ctx, place, p, progress, t, s) {
  if (msg.action === 'open-gate') {
    if (s.gate.until > t) return true;
    if (p.coins < 3) {
      tell(ctx, player, 'São necessárias 3 fichas fictícias para abrir o portão.');
      return true;
    }
    p.coins -= 3;
    s.gate = { openedAt: t, until: t + 10000 };
  } else if (msg.action === 'collect-emenda') {
    if (
      !(s.gate.openedAt && t >= s.gate.openedAt + 700 && t < s.gate.until) ||
      player.z >= place.z + 11
    ) {
      tell(ctx, player, 'Abra o portão e entre no pátio para alcançar o cofre.');
      return true;
    }
    if ((p.ready.congress ?? 0) > t) return true;
    p.ready.congress = t + 60000;
    p.coins += 5;
    effect(s, player, 'coins', t);
  }
  return true;
}
function actionWhalePool() {
  return true;
}
function wakeBoss(player, ctx, p, t, boss) {
  if (p.hp <= 0) {
    tell(ctx, player, 'Recupere seus HP no supermercado antes de participar.');
    return true;
  }
  if (boss.readyAt > t) return true;
  if (boss.until <= t) {
    Object.assign(boss, { hp: 100, until: t + 60000, nextPulse: t + 5000, waveAt: 0 });
    ctx.localWorld.bossParticipants = new Set();
    ctx.localWorld.bossContributors = new Set();
  }
  (ctx.localWorld.bossParticipants ??= new Set()).add(player.id);
  tell(ctx, player, 'Você entrou no desafio. Afaste-se da onda dourada para evitar dano.');
  return true;
}
function rewardBossContributors(ctx, place, progress, t, s) {
  for (const target of ctx.players?.values() ?? [])
    if (
      !target.spectator &&
      ctx.localWorld.bossParticipants.has(target.id) &&
      ctx.localWorld.bossContributors?.has(target.id) &&
      progress(target, ctx).secret.hp > 0 &&
      distance(target, place) < 35
    ) {
      const pr = progress(target, ctx).secret;
      pr.coins += 5;
      effect(s, target, 'coins', t);
      emitProgress(ctx, target, progress);
    }
}
function actionLiberty(player, msg, ctx, place, p, progress, t, s) {
  const boss = s.boss;
  if (msg.action === 'wake-boss') return wakeBoss(player, ctx, p, t, boss);
  if (boss.until <= t || !ctx.localWorld.bossParticipants?.has(player.id)) {
    tell(ctx, player, 'Entre no desafio antes de golpear a estátua.');
    return true;
  }
  if ((p.ready.bossStrike ?? 0) > t || p.hp <= 0) return true;
  (ctx.localWorld.bossContributors ??= new Set()).add(player.id);
  p.ready.bossStrike = t + 800;
  boss.hp = Math.max(0, boss.hp - 10);
  effect(s, player, 'confetti', t);
  if (boss.hp === 0) {
    boss.until = 0;
    boss.readyAt = t + 60000;
    rewardBossContributors(ctx, place, progress, t, s);
    ctx.localWorld.bossParticipants.clear();
  }
  return true;
}
function actionChairPlaza(player, msg, ctx, place, p, progress, t, s) {
  if (!player.pvp?.on || !canUsePvp(player, ctx) || peace(player)) {
    tell(ctx, player, 'Ative o PvP para usar o lançador.');
    return true;
  }
  if ((p.ready[place.id] ?? 0) > t) return true;
  p.ready[place.id] = t + 5000;
  s.chairs.push({
    id: `${player.id}:${t}`,
    owner: player.id,
    team: player.team,
    x: player.x,
    z: player.z,
    yaw: player.yaw ?? 0,
    at: t,
    until: t + 1600,
    processedAt: t,
  });
  return true;
}

const attractionHandlers = {
  triplex: actionTriplex,
  temple: actionTemple,
  supermarket: actionSupermarket,
  'tire-camp': actionTireCamp,
  bank: actionBank,
  congress: actionCongress,
  'whale-pool': actionWhalePool,
  liberty: actionLiberty,
  'chair-plaza': actionChairPlaza,
};
export function attractionAction(player, msg, ctx, place, p, progress, t = Date.now()) {
  const s = ctx.state.world.secret;
  const handler = Object.hasOwn(attractionHandlers, place.id) ? attractionHandlers[place.id] : null;
  return handler ? handler(player, msg, ctx, place, p, progress, t, s) : false;
}
