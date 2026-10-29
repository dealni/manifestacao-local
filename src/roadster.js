import { stepPlayer, constants, canOccupyPlayer, spawnForTeam } from './simulation.js';

export const ROADSTER = Object.freeze({
  kind: 12,
  boostMs: 1200,
  boostCooldown: 10000,
  jumpCooldown: 8000,
  liftMs: 650,
  maxAlt: 11,
  top: 27,
  boostTop: 43,
  rollRate: 3.2,
});
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, fallback = 0) => (Number.isFinite(n) ? n : fallback);
const angle = (n) => Math.atan2(Math.sin(n), Math.cos(n));
export function createRocket(player) {
  return {
    x: finite(player.x),
    z: finite(player.z),
    yaw: finite(player.yaw),
    speed: finite(player.speed),
    alt: 0,
    vy: 0,
    pitch: 0,
    roll: 0,
    boostUntil: 0,
    boostReady: 0,
    jumpReady: 0,
    liftUntil: 0,
    rollInput: 0,
    controlAt: 0,
    safeX: finite(player.x),
    safeZ: finite(player.z),
    safeYaw: finite(player.yaw),
    jets: 0,
  };
}
function state(player) {
  if (!player.rocket || player.rocketVehicle !== player.vehicle) {
    player.rocket = createRocket(player);
    player.rocketVehicle = player.vehicle;
  }
  return player.rocket;
}
function inPeace(p) {
  const b = constants.PEACE;
  return p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
}
export function handleRoadsterMessage(player, msg, ctx = {}, now = Date.now()) {
  if (msg?.t !== 'roadster') return false;
  if (
    player.mode !== 12 ||
    !player.vehicle ||
    player.spectator ||
    player.raceFrozen ||
    player.race ||
    !Number.isFinite(now)
  )
    return true;
  const r = state(player);
  if (msg.a === 'boost' && now >= r.boostReady) {
    r.boostUntil = now + ROADSTER.boostMs;
    r.boostReady = now + ROADSTER.boostCooldown;
  } else if (msg.a === 'jump' && now >= r.jumpReady && r.alt <= 0.08 && !inPeace(player)) {
    r.jumpOrigin = r.alt;
    r.vy = 8.8;
    r.alt += 0.02;
    r.liftUntil = now + ROADSTER.liftMs;
    r.jumpReady = now + ROADSTER.jumpCooldown;
    r.safeX = player.x;
    r.safeZ = player.z;
    r.safeYaw = player.yaw;
  } else if (msg.a === 'roll') {
    r.rollInput = clamp(finite(Number(msg.roll)), -1, 1);
    r.controlAt = now;
  } else return true;
  ctx.broadcast?.({ t: 'roadsters', at: now, items: [roadsterVehicle(player)] });
  return true;
}
/** Aproximação local do voo público; não inclui a geometria tridimensional de tetos/rampa. */
function stepGroundRoadster(player, r, control, step, ctx, boost) {
  stepPlayer(player, control, step, ctx);
  if (boost) player.speed = clamp(player.speed + 35 * step, -5, ROADSTER.boostTop);
  r.pitch += (0 - r.pitch) * (1 - Math.exp(-10 * step));
  r.roll += (0 - r.roll) * (1 - Math.exp(-10 * step));
  r.safeX = player.x;
  r.safeZ = player.z;
  r.safeYaw = player.yaw;
  r.jets = boost ? 1 : 0;
}

function landRoadster(player, r, ctx, boost) {
  // O voo pode cruzar sólidos; o pouso precisa voltar a uma pose terrestre livre.
  if (!canOccupyPlayer(player, ctx)) {
    const safe = { ...player, x: r.safeX, z: r.safeZ, yaw: r.safeYaw ?? player.yaw };
    const landing = canOccupyPlayer(safe, ctx) ? safe : spawnForTeam(player.team, ctx, player);
    player.speed = 0;
    if (landing) {
      player.x = landing.x;
      player.z = landing.z;
      player.yaw = landing.yaw;
    } else {
      // Sem um destino livre, adia o pouso até o bloqueio temporário sair.
      r.alt = 0.02;
      r.vy = 0;
      r.x = player.x;
      r.z = player.z;
      r.yaw = player.yaw;
      r.speed = player.speed;
      return false;
    }
  }
  r.alt = 0;
  r.vy = 0;
  r.pitch = 0;
  r.roll = 0;
  r.jets = boost ? 1 : 0;
  delete r.jumpOrigin;
  return true;
}

function stepAirRoadster(player, r, control, step, ctx, at, boost) {
  player.speed +=
    (control.z * (boost ? ROADSTER.boostTop : ROADSTER.top) - player.speed) *
    (1 - Math.exp(-(boost ? 3.8 : 0.9) * step));
  player.yaw = angle(player.yaw - control.x * 1.5 * step);
  const roll = at - r.controlAt < 450 ? r.rollInput : 0;
  r.roll = roll ? angle(r.roll + roll * ROADSTER.rollRate * step) : r.roll * Math.exp(-3 * step);
  const targetPitch = clamp(-r.vy * 0.025 + control.z * 0.08, -0.35, 0.35);
  r.pitch += (targetPitch - r.pitch) * (1 - Math.exp(-4 * step));
  r.vy += (at < r.liftUntil ? 12 : -13) * step;
  r.alt += r.vy * step;
  const top = (r.jumpOrigin ?? 0) + ROADSTER.maxAlt;
  if (r.alt >= top) {
    r.alt = top;
    if (r.vy > 0) r.vy = 0;
  }
  const b = constants.BOUNDS;
  player.x = clamp(player.x + Math.sin(player.yaw) * player.speed * step, b.minX + 1, b.maxX - 1);
  player.z = clamp(player.z + Math.cos(player.yaw) * player.speed * step, b.minZ + 1, b.maxZ - 1);
  r.jets = (boost ? 1 : 0) | 2 | (roll ? 4 : 0);
  if (r.alt <= 0) {
    return landRoadster(player, r, ctx, boost);
  }
  return true;
}

export function tickRoadster(player, input = {}, dt = 0, ctx = {}, now = Date.now()) {
  if (player.mode !== 12 || !player.vehicle) {
    // A altura do foguete não pertence ao próximo veículo (o dirigível usa 27 m).
    if (player.rocket) delete player.alt;
    delete player.rocket;
    delete player.rocketVehicle;
    return false;
  }
  const r = state(player);
  dt = clamp(finite(dt), 0, 0.25);
  if (!dt || !Number.isFinite(now)) return true;
  const control = {
    x: clamp(finite(input.x), -1, 1),
    z: clamp(finite(input.z), -1, 1),
    run: !!input.run,
  };
  const count = Math.max(1, Math.ceil(dt * 120)),
    step = dt / count;
  for (let i = 0; i < count; i++) {
    const at = now - dt * 1000 + (i + 1) * step * 1000,
      boost = at < r.boostUntil;
    if (player.raceFrozen) {
      player.speed = 0;
      r.speed = 0;
      break;
    }
    if (r.alt <= 0) {
      stepGroundRoadster(player, r, control, step, ctx, boost);
    } else {
      if (!stepAirRoadster(player, r, control, step, ctx, at, boost)) continue;
    }
    r.x = player.x;
    r.z = player.z;
    r.yaw = player.yaw;
    r.speed = player.speed;
  }
  player.alt = r.alt;
  return true;
}
export function roadsterVehicle(player) {
  const rocket = state(player);
  return {
    id: player.vehicle,
    kind: 12,
    owner: player.id,
    team: player.team,
    x: player.x,
    z: player.z,
    yaw: player.yaw,
    speed: player.speed,
    alt: rocket.alt,
    rocket: { ...rocket, x: player.x, z: player.z, yaw: player.yaw, speed: player.speed },
    rocketInput: {
      x: finite(player.input?.x),
      z: finite(player.input?.z),
      run: !!player.input?.run,
    },
  };
}
