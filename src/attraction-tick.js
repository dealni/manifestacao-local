import { canUsePvp } from './game-permissions.js';
import {
  tell,
  distance,
  peace,
  isProtected,
  relocateWorldPlayer,
  pathFree,
  emitProgress,
} from './attraction-common.js';

function tickRides(player, ctx, s, currentPlayers, t) {
  let changed = false;
  const rides = s.rides.filter((r) => r.until > t && currentPlayers.has(r.owner));
  if (rides.length !== s.rides.length) {
    s.rides = rides;
    changed = true;
  }
  if (player.secretRide && !rides.some((r) => r.owner === player.id)) {
    player.secretRide = false;
    relocateWorldPlayer(player, ctx, 226, -112.5, t);
  }
  return changed;
}
function relocateFromClosedGate(player, ctx, s, t) {
  if (
    s.gate.openedAt &&
    t >= s.gate.until &&
    Math.abs(player.x + 216) < 4.8 &&
    player.z > -417 &&
    player.z < -409
  )
    relocateWorldPlayer(player, ctx, -216, -407, t);
}
function pruneEffects(s, currentPlayers, t) {
  let changed = false;
  const wards = s.wards.filter((w) => w.until > t && currentPlayers.has(w.owner));
  if (wards.length !== s.wards.length) {
    s.wards = wards;
    changed = true;
  }
  const effects = s.effects.filter((e) => t - e.at < 2500);
  if (effects.length !== s.effects.length) {
    s.effects = effects;
    changed = true;
  }
  return changed;
}
function chairTargetEligible(chair, target, pos, ctx, t) {
  return (
    target.id !== chair.owner &&
    !target.spectator &&
    target.pvp?.on &&
    canUsePvp(target, ctx) &&
    target.team !== chair.team &&
    !peace(target) &&
    !isProtected(target, ctx, t) &&
    distance(pos, target) < 0.9
  );
}
function hitChairTarget(chair, pos, currentPlayers, ctx, t, yaw) {
  for (const target of currentPlayers.values()) {
    if (!chairTargetEligible(chair, target, pos, ctx, t)) continue;
    chair.hit = true;
    ctx.broadcast?.({
      t: 'physical',
      actions: [
        {
          id: target.id,
          kind: 'hit',
          by: chair.owner,
          weapon: 'push',
          duration: 560,
          clip: 'pvp_hit',
          at: t,
          yaw,
          strength: 1,
        },
      ],
    });
    break;
  }
}
function moveChair(chair, currentPlayers, ctx, t) {
  const end = Math.min(t, chair.until),
    start = Math.max(chair.at, chair.processedAt ?? chair.at),
    yaw = chair.yaw;
  const point = (at) => ({
    x: chair.x + (Math.sin(yaw) * 10 * (at - chair.at)) / 1000,
    z: chair.z + (Math.cos(yaw) * 10 * (at - chair.at)) / 1000,
  });
  let previous = point(start);
  for (
    let at = start + Math.min(20, end - start);
    at <= end && at > start;
    at = Math.min(end, at + 20)
  ) {
    const pos = point(at);
    if (!pathFree(previous, pos, ctx)) {
      chair.hit = true;
      break;
    }
    hitChairTarget(chair, pos, currentPlayers, ctx, t, yaw);
    if (chair.hit || at === end) break;
    previous = pos;
  }
  chair.processedAt = end;
}

function tickChairs(s, currentPlayers, ctx, t) {
  let changed = false;
  for (const chair of s.chairs) {
    const owner = currentPlayers.get(chair.owner);
    if (!owner || !owner.pvp?.on || !canUsePvp(owner, ctx) || owner.spectator || peace(owner)) {
      chair.hit = true;
      continue;
    }
    if (chair.hit) continue;
    moveChair(chair, currentPlayers, ctx, t);
  }
  const chairs = s.chairs.filter((c) => !c.hit && c.until > t);
  if (chairs.length !== s.chairs.length) {
    s.chairs = chairs;
    changed = true;
  }
  return changed;
}
function tickBossWave(boss, currentPlayers, ctx, progress, t) {
  let changed = false;
  const wave = ctx.localWorld.bossWave;
  if (boss.until > t && wave && wave.processedAt <= boss.waveAt + 1800) {
    const from = Math.max(0, Math.min(1, (wave.processedAt - boss.waveAt) / 1800)),
      to = Math.max(0, Math.min(1, (t - boss.waveAt) / 1800));
    for (const target of currentPlayers.values()) {
      const r = distance(target, { x: 216, z: 357 });
      if (
        !target.spectator &&
        ctx.localWorld.bossParticipants?.has(target.id) &&
        !wave.hits.has(target.id) &&
        r >= 1 + 12 * from - 0.6 &&
        r <= 1 + 12 * to + 0.6
      ) {
        wave.hits.add(target.id);
        if (isProtected(target, ctx, t)) continue;
        const pr = progress(target, ctx).secret;
        pr.hp = Math.max(0, pr.hp - 20);
        emitProgress(ctx, target, progress);
        changed = true;
        if (pr.hp === 0) {
          ctx.localWorld.bossParticipants.delete(target.id);
          tell(
            ctx,
            target,
            'Seus HP do desafio acabaram. Recupere-se no supermercado para participar novamente.',
          );
        }
      }
    }
    wave.processedAt = t;
  }
  return changed;
}
function tickBoss(s, currentPlayers, ctx, progress, t) {
  let changed = false;
  const boss = s.boss;
  if (boss.until > t && boss.nextPulse <= t) {
    boss.waveAt = t;
    boss.nextPulse = t + 5000;
    ctx.localWorld.bossWave = { processedAt: t, hits: new Set() };
    changed = true;
  }
  changed = tickBossWave(boss, currentPlayers, ctx, progress, t) || changed;
  if (boss.until && boss.until <= t) {
    boss.until = 0;
    boss.readyAt = t + 15000;
    ctx.localWorld.bossParticipants?.clear();
    changed = true;
  }
  return changed;
}

export function tickAttractions(player, ctx, progress) {
  const s = ctx.state.world.secret,
    t = Date.now();
  let changed = false;
  const currentPlayers = ctx.players ?? new Map([[player.id, player]]);
  changed = tickRides(player, ctx, s, currentPlayers, t) || changed;
  relocateFromClosedGate(player, ctx, s, t);
  changed = pruneEffects(s, currentPlayers, t) || changed;
  changed = tickChairs(s, currentPlayers, ctx, t) || changed;
  changed = tickBoss(s, currentPlayers, ctx, progress, t) || changed;
  if (changed) {
    ctx.save();
    ctx.broadcast?.({ t: 'secret_places', ...s });
  }
}
