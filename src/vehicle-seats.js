/** Caronas autoritativas: motorista e um passageiro por carro. */
import { canOccupyPlayer, spawnForTeam, vehicleCircles } from './simulation.js';

export const PASSENGER_MODE = 33;
export const SEAT_KINDS = new Set([1, 5]);
const note = (p, ctx, text) => ctx.sendPlayer?.(p, { t: 'notice', text });
const debated = (p, ctx) =>
  [...(ctx.debateSessions?.values() ?? [])].some(
    (s) => s.host?.id === p.id || s.guest?.id === p.id,
  );
const available = (p, ctx) =>
  p &&
  [p.x, p.z, p.yaw].every(Number.isFinite) &&
  !p.spectator &&
  !p.secretRide &&
  !p.race &&
  !p.raceFrozen &&
  !(ctx.race?.rows ?? []).some(
    (row) => row.id === p.id && ['queued', 'racing'].includes(row.status),
  ) &&
  !debated(p, ctx);
const driving = (p, ctx) => available(p, ctx) && SEAT_KINDS.has(p.mode) && p.vehicle;

export function vehiclePassengers(ctx) {
  return new Map(
    [...(ctx.players?.values() ?? [])]
      .filter((p) => p.vehicleSeat && p.mode === PASSENGER_MODE)
      .map((p) => [p.vehicleSeat.vehicle, p.id]),
  );
}
function exitPassenger(p, ctx) {
  const seat = p.vehicleSeat;
  if (!seat) return;
  const driver = ctx.players?.get(seat.driver);
  delete p.vehicleSeat;
  if (p.mode === PASSENGER_MODE) {
    p.mode = 0;
    p.vehicle = 0;
  }
  const origin = driver ?? p,
    yaw = origin.yaw ?? 0;
  const points = [2.6, -2.6, 4, -4, 6, -6].flatMap((side) =>
    [0, -3, 3].map((ahead) => ({
      x: origin.x + Math.cos(yaw) * side + Math.sin(yaw) * ahead,
      z: origin.z - Math.sin(yaw) * side + Math.cos(yaw) * ahead,
    })),
  );
  const safe = points.find(
    (point) =>
      Math.abs(point.x) <= 260 &&
      Math.abs(point.z) <= 640 &&
      canOccupyPlayer({ ...p, ...point, mode: 0, vehicle: 0, spectator: false }, ctx),
  );
  const fallback =
    safe ??
    spawnForTeam(p.team ?? 0, ctx, {
      ...p,
      mode: 0,
      vehicle: 0,
      spectator: false,
    });
  Object.assign(p, fallback, {
    speed: 0,
    input: { x: 0, z: 0, run: false },
    lastPoseAt: 0,
  });
  delete p.worldPrevious;
  ctx.sendPlayer?.(p, { t: 'relocate', x: p.x, z: p.z, yaw: p.yaw, at: Date.now() >>> 0 });
}
/** Libera o passageiro ou todos os ocupantes do carro deste motorista. */
export function releaseVehicleSeats(p, ctx) {
  exitPassenger(p, ctx);
  for (const rider of ctx.players?.values() ?? [])
    if (rider.vehicleSeat?.driver === p.id) exitPassenger(rider, ctx);
}
export function handleVehicleSeat(p, msg, ctx) {
  if (msg.t !== 'seat') return false;
  if (msg.on === false) {
    releaseVehicleSeats(p, ctx);
    return true;
  }
  if (msg.on !== true) return true;
  if (!available(p, ctx) || p.mode !== 0 || p.vehicle || p.stageDeck) {
    note(p, ctx, 'Fique a pé e saia de outras atividades antes de pegar uma carona.');
    return true;
  }
  const driver = [...(ctx.players?.values() ?? [])].find(
    (candidate) => candidate.id !== p.id && candidate.vehicle === msg.id && driving(candidate, ctx),
  );
  if (!driver) {
    note(p, ctx, 'Aproxime-se de um carro com motorista para pegar uma carona.');
    return true;
  }
  if (
    Math.min(
      ...vehicleCircles(driver, driver.mode).map(
        ([x, z, radius]) => Math.hypot(p.x - x, p.z - z) - radius,
      ),
    ) > 2.2
  ) {
    note(p, ctx, 'Aproxime-se do carro para embarcar.');
    return true;
  }
  if (vehiclePassengers(ctx).has(driver.vehicle)) {
    note(p, ctx, 'Carro cheio: já tem motorista e passageiro.');
    return true;
  }
  p.vehicleSeat = { driver: driver.id, vehicle: driver.vehicle };
  p.mode = PASSENGER_MODE;
  p.vehicle = driver.vehicle;
  p.emote = 0;
  p.input = { x: 0, z: 0, run: false };
  delete p.worldPrevious;
  syncPassenger(p, driver);
  return true;
}
function syncPassenger(p, driver) {
  Object.assign(p, { x: driver.x, z: driver.z, yaw: driver.yaw, speed: driver.speed });
}
/** Executado depois de integrar todos os motoristas, antes dos snapshots e impactos. */
export function tickVehicleSeats(ctx) {
  for (const p of ctx.players?.values() ?? []) {
    if (!p.vehicleSeat) continue;
    const driver = ctx.players.get(p.vehicleSeat.driver);
    if (
      p.mode !== PASSENGER_MODE ||
      !available(p, ctx) ||
      !driving(driver, ctx) ||
      driver.vehicle !== p.vehicleSeat.vehicle
    )
      exitPassenger(p, ctx);
    else syncPassenger(p, driver);
  }
}
