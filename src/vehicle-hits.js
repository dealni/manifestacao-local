import { canUsePvp, canUseVehicle } from './game-permissions.js';
import { constants, VEHICLE_TUNING, vehicleCircles, canOccupyPlayer } from './simulation.js';

const samples = new WeakMap();
const recovery = new WeakMap();
const groundModes = new Set([1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
const finitePose = (p) => [p.x, p.z, p.yaw].every(Number.isFinite);
const peace = (p) =>
  p.x >= constants.PEACE.minX &&
  p.x <= constants.PEACE.maxX &&
  p.z >= constants.PEACE.minZ &&
  p.z <= constants.PEACE.maxZ;
const protectedAt = (p, ctx, t) =>
  (ctx.state.world?.secret?.wards ?? []).some((w) => w.owner === p.id && w.until > t);
const seated = (p, ctx) =>
  [...(ctx.debateSessions?.values() ?? [])].some(
    (s) => s.host?.id === p.id || s.guest?.id === p.id,
  );
const eligible = (p, ctx, t) =>
  finitePose(p) &&
  !p.spectator &&
  !p.vehicleSeat &&
  !(p.mode === 12 && (p.rocket?.alt ?? 0) > 0.4) &&
  !p.race &&
  !p.raceFrozen &&
  !p.secretRide &&
  !seated(p, ctx) &&
  !peace(p) &&
  !protectedAt(p, ctx, t) &&
  p.pvp?.on &&
  canUsePvp(p, ctx);

function segmentDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax,
    dz = bz - az;
  const fraction = Math.max(
    0,
    Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)),
  );
  return Math.hypot(x - ax - fraction * dx, z - az - fraction * dz);
}

function canSampleVehicle(player, previous, current, ctx) {
  if (
    !previous ||
    !previous.eligible ||
    !current.eligible ||
    previous.mode !== player.mode ||
    previous.vehicle !== player.vehicle ||
    !player.vehicle ||
    !groundModes.has(player.mode) ||
    !canUseVehicle(player, ctx, player.mode) ||
    (player.rocket?.alt ?? 0) > 0.4
  )
    return false;
  return true;
}

function validTargetSample(target, t) {
  const targetSample = samples.get(target),
    targetBefore = targetSample?.at === t ? targetSample.previous : targetSample;
  if (
    !targetBefore ||
    t - targetBefore.at <= 0 ||
    t - targetBefore.at > 250 ||
    Math.hypot(target.x - targetBefore.x, target.z - targetBefore.z) >
      ((constants.RUN_SPEED * (t - targetBefore.at)) / 1000) * 1.35 + 0.15
  )
    return false;
  return true;
}

function collectVehicleHits(player, previous, ctx, t, dt, distance) {
  const before = vehicleCircles(previous, player.mode),
    after = vehicleCircles(player, player.mode),
    hits = [];
  for (const target of ctx.players?.values() ?? []) {
    if (
      target === player ||
      target.mode ||
      target.vehicle ||
      target.team === player.team ||
      !eligible(target, ctx, t) ||
      (recovery.get(target) ?? 0) > t
    )
      continue;
    if (!validTargetSample(target, t)) continue;
    // Se o veículo já estava sobre o pedestre, não se trata de uma nova entrada.
    if (
      before.some(
        ([x, z, r]) => Math.hypot(target.x - x, target.z - z) <= r + constants.PLAYER_RADIUS,
      )
    )
      continue;
    if (
      !after.some(
        ([x, z, r], i) =>
          segmentDistance(target.x, target.z, before[i][0], before[i][1], x, z) <=
          r + constants.PLAYER_RADIUS,
      )
    )
      continue;
    recovery.set(target, t + 3600);
    hits.push({
      id: target.id,
      kind: 'fall',
      weapon: 'push',
      clip: 'pvp_fall',
      duration: 3600,
      at: t,
      event: t,
      by: player.id,
      yaw: target.yaw ?? 0,
      strength: Math.min(7, distance / dt),
      vx: (player.x - previous.x) / dt,
      vz: (player.z - previous.z) / dt,
    });
  }
  return hits;
}

/** Avalia trajetórias observadas no servidor; mensagens declarando atropelamento não existem. */
export function detectVehicleHits(player, ctx, t = Date.now()) {
  const previous = samples.get(player);
  const current = {
    x: player.x,
    z: player.z,
    yaw: player.yaw,
    trailer: player.trailer,
    mode: player.mode,
    vehicle: player.vehicle,
    at: t,
    eligible: eligible(player, ctx, t),
    previous: previous && { x: previous.x, z: previous.z, at: previous.at },
  };
  samples.set(player, current);
  if (!canSampleVehicle(player, previous, current, ctx)) return [];
  const dt = (t - previous.at) / 1000,
    distance = Math.hypot(player.x - previous.x, player.z - previous.z);
  const tuning = VEHICLE_TUNING[player.mode],
    maximum =
      player.mode === 12
        ? 43
        : Math.max(tuning.forward, tuning.reverse, [9, 10, 11].includes(player.mode) ? 8.5 : 0);
  // Poses previstas continuam aceitas pelo protocolo, mas não sua velocidade declarada.
  // Troca/teleporte/atraso ou spam de poses não pode produzir um segmento premiável.
  if (dt <= 0 || dt > 0.25 || distance / dt < 2 || distance > maximum * dt * 1.35 + 0.15) return [];
  const turn = Math.abs(
    Math.atan2(Math.sin(player.yaw - previous.yaw), Math.cos(player.yaw - previous.yaw)),
  );
  if (turn > tuning.steer * dt * 1.5 + 0.08) return [];
  const steps = Math.max(1, Math.ceil(distance / 0.4));
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps,
      pose = {
        ...player,
        x: previous.x + (player.x - previous.x) * ratio,
        z: previous.z + (player.z - previous.z) * ratio,
      };
    if (peace(pose) || !canOccupyPlayer(pose, ctx)) return [];
  }
  return collectVehicleHits(player, previous, ctx, t, dt, distance);
}
