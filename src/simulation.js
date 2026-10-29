// Física reconstruída dos dados públicos; não executa o bundle no servidor.
import { readFileSync } from 'node:fs';
import { brasiliaLayout, isClearedCollider, landmarkSolids } from './brasilia-layout.js';
import { BUILDINGS } from './simulation-buildings.js';

export const VEHICLE_TUNING = {
  13: {
    forward: 2.4,
    reverse: 1.1,
    accel: 3.2,
    coast: 5,
    brake: 6.5,
    steer: 1.6,
    grip: 0.5,
  },
  12: {
    forward: 27,
    reverse: 5,
    accel: 4.5,
    coast: 1.2,
    brake: 7,
    steer: 1.25,
    grip: 4,
  },
  1: {
    forward: 16,
    reverse: 6,
    accel: 2.6,
    coast: 3.5,
    brake: 5.8,
    steer: 1.15,
    grip: 3,
  },
  3: {
    forward: 9.5,
    reverse: 3,
    accel: 0.7,
    coast: 1.1,
    brake: 2.4,
    steer: 0.5,
    grip: 4,
  },
  5: {
    forward: 13,
    reverse: 5,
    accel: 2.1,
    coast: 3,
    brake: 5.2,
    steer: 1.05,
    grip: 3,
  },
  6: {
    forward: 8.5,
    reverse: 2.5,
    accel: 0.65,
    coast: 1,
    brake: 2.3,
    steer: 0.55,
    grip: 4,
  },
  7: {
    forward: 15,
    reverse: 1.4,
    accel: 4.5,
    coast: 2.4,
    brake: 7.5,
    steer: 1.9,
    grip: 2,
  },
  8: {
    forward: 17,
    reverse: 1.2,
    accel: 3.6,
    coast: 2,
    brake: 6.5,
    steer: 1.7,
    grip: 2.4,
  },
  10: {
    forward: 4.8,
    reverse: 1.2,
    accel: 2.8,
    coast: 4.2,
    brake: 5.5,
    steer: 1.35,
    grip: 1,
  },
  11: {
    forward: 4.8,
    reverse: 1.2,
    accel: 2.8,
    coast: 4.2,
    brake: 5.5,
    steer: 1.35,
    grip: 1,
  },
  9: {
    forward: 4.8,
    reverse: 1.2,
    accel: 2.8,
    coast: 4.2,
    brake: 5.5,
    steer: 1.35,
    grip: 1,
  },
};
const VEHICLE_SHAPES = {
  12: {
    r: 0.98,
    offsets: [-1.31, -0.65, 0, 0.65, 1.31],
  },
  1: {
    r: 0.88,
    offsets: [-1.2, -0.6, 0, 0.6, 1.2],
  },
  2: {
    r: 1.28,
    offsets: [-2.1, -1.4, -0.7, 0, 0.7, 1.4, 2.1],
  },
  3: {
    r: 1.3,
    offsets: [0.3, 1.5, 2.7, 3.9],
    trailer: [-0.9, -2.3, -3.7, -5.1, -6.5, -7.9, -9.3, -10],
  },
  5: {
    r: 0.96,
    offsets: [-1.04, -0.52, 0, 0.52, 1.04],
  },
  6: {
    r: 1.32,
    offsets: [-3.78, -2.835, -1.89, -0.945, 0, 0.945, 1.89, 2.835, 3.78],
  },
  7: {
    r: 0.4,
    offsets: [-0.65, -0.22, 0.22, 0.65],
  },
  8: {
    r: 0.43,
    offsets: [-0.77, -0.26, 0.26, 0.77],
  },
  10: {
    r: 0.75,
    offsets: [-2.97, -2.35, -1.65, -0.9, -0.15, 0.55, 1.2, 1.85, 2.28, -0.07, -0.07, 1.78, 1.78],
    radii: [0.1, 0.18, 0.26, 0.38, 0.67, 0.75, 0.68, 0.58, 0.37, 0.34, 0.34, 0.34, 0.34],
    lateral: [0, 0, 0, 0, 0, 0, 0, 0, 0, -0.99, 0.99, -0.99, 0.99],
  },
  13: {
    r: 0.5,
    offsets: [-1.18, -0.25, 0.25],
    radii: [0.28, 0.5, 0.5],
  },
  9: {
    r: 0.79,
    offsets: [-2.93, -2.45, -1.85, -1.15, -0.45, 0.25, 0.95, 1.55, 2.06],
    radii: [0.18, 0.25, 0.36, 0.5, 0.68, 0.79, 0.65, 0.55, 0.44],
  },
  11: {
    r: 0.477,
    offsets: [-2.442, -2.094, -1.686, -1.279, -0.872, -0.465, -0.058, 0.349, 0.547],
    radii: [0.093, 0.151, 0.279, 0.407, 0.477, 0.454, 0.378, 0.291, 0.128],
  },
};

export const constants = Object.freeze({
  WALK_SPEED: 1.7,
  RUN_SPEED: 4.6,
  PLAYER_RADIUS: 0.4,
  MAX_DT: 0.25,
  FIXED_DT: 1 / 60,
  BOUNDS: Object.freeze({ minX: -260, maxX: 260, minZ: -640, maxZ: 640 }),
  PEACE: Object.freeze({ minX: -106.5, maxX: 28, minZ: -72.35, maxZ: 16.4 }),
});
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, fallback = 0) => (Number.isFinite(n) ? n : fallback);
let places = [];
try {
  places =
    JSON.parse(readFileSync(new URL('./world-data.json', import.meta.url), 'utf8')).places ?? [];
} catch {
  /* Geometria opcional ausente mantém a lista de atrações vazia. */
}

// O cliente recorta os prédios para abrir os lotes dos locais interativos.
function subtractPlot(rect, plot, margin = 1) {
  const [x, z, w, d] = rect;
  const l = x - w / 2,
    r = x + w / 2,
    b = z - d / 2,
    t = z + d / 2;
  const pl = plot.x - plot.w / 2 - margin,
    pr = plot.x + plot.w / 2 + margin;
  const pb = plot.z - plot.d / 2 - margin,
    pt = plot.z + plot.d / 2 + margin;
  if (r <= pl || l >= pr || t <= pb || b >= pt) return [rect];
  return [
    [l, Math.min(r, pl), b, t],
    [Math.max(l, pr), r, b, t],
    [Math.max(l, pl), Math.min(r, pr), b, Math.min(t, pb)],
    [Math.max(l, pl), Math.min(r, pr), Math.max(b, pt), t],
  ]
    .filter(([a, b, c, d]) => b - a > 0.001 && d - c > 0.001)
    .map(([a, b, c, d]) => [(a + b) / 2, (c + d) / 2, b - a, d - c]);
}
let staticRects = BUILDINGS.filter(
  ([x, z, w, d]) => !isClearedCollider(x, z, w, d, brasiliaLayout),
);
staticRects.push(...landmarkSolids(brasiliaLayout));
for (const place of places) staticRects = staticRects.flatMap((rect) => subtractPlot(rect, place));
// CC/KC/Zw também abrem os acessos no cliente, com clearance zero.
for (const place of places)
  if (place.alley) staticRects = staticRects.flatMap((rect) => subtractPlot(rect, place.alley, 0));
for (const place of places)
  for (const solid of place.solid ?? [])
    staticRects.push([place.x + solid.x, place.z + solid.z, solid.w, solid.d]);
// Os pilares do vão do MASP são sólidos; o próprio vão permite passagem.
staticRects.push([-40.15, -27.93, 5, 8]);
for (const x of [-48.31, -30.5]) for (const z of [-65.81, 10.49]) staticRects.push([x, z, 2.6, 4]);
const grid = new Map(),
  CELL = 16;
for (const rect of staticRects) {
  const [x, z, w, d] = rect;
  for (let ix = Math.floor((x - w / 2) / CELL); ix <= Math.floor((x + w / 2) / CELL); ix++)
    for (let iz = Math.floor((z - d / 2) / CELL); iz <= Math.floor((z + d / 2) / CELL); iz++) {
      const key = `${ix},${iz}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(rect);
    }
}
export const STATIC_COLLIDER_COUNT = staticRects.length;
function penetration(x, z, radius, ctx, ignoreId) {
  const b = constants.BOUNDS;
  let depth = Math.max(
    0,
    b.minX - x + radius,
    x + radius - b.maxX,
    b.minZ - z + radius,
    z + radius - b.maxZ,
  );
  const seen = new Set();
  for (let ix = Math.floor((x - radius) / CELL); ix <= Math.floor((x + radius) / CELL); ix++)
    for (let iz = Math.floor((z - radius) / CELL); iz <= Math.floor((z + radius) / CELL); iz++)
      for (const rect of grid.get(`${ix},${iz}`) ?? []) {
        if (seen.has(rect)) continue;
        seen.add(rect);
        const [rx, rz, w, d] = rect;
        const dx = Math.max(Math.abs(x - rx) - w / 2, 0),
          dz = Math.max(Math.abs(z - rz) - d / 2, 0);
        depth = Math.max(depth, radius - Math.hypot(dx, dz));
      }
  // Mesmo vão _C/BC do cliente: só atravessa com a porta totalmente aberta.
  const gate = ctx?.state?.world?.secret?.gate,
    t = Date.now();
  const gateOpen = gate?.openedAt && t >= gate.openedAt + 700 && t <= gate.until;
  if (!gateOpen) {
    const dx = Math.max(Math.abs(x + 216) - 1.2, 0),
      dz = Math.max(Math.abs(z + 409) - 0.1, 0);
    depth = Math.max(depth, radius - Math.hypot(dx, dz));
  }
  for (const obstacle of ctx?.colliders ?? []) {
    if (ignoreId !== undefined && obstacle.id === ignoreId) continue;
    if (Number.isFinite(obstacle.w) && Number.isFinite(obstacle.d)) {
      const dx = Math.max(Math.abs(x - obstacle.x) - obstacle.w / 2, 0),
        dz = Math.max(Math.abs(z - obstacle.z) - obstacle.d / 2, 0);
      depth = Math.max(depth, radius - Math.hypot(dx, dz));
    } else
      depth = Math.max(
        depth,
        radius + finite(obstacle.radius, 0.4) - Math.hypot(x - obstacle.x, z - obstacle.z),
      );
  }
  return depth;
}
export function canOccupy(x, z, radius = 0.4, ctx) {
  return Number.isFinite(x) && Number.isFinite(z) && penetration(x, z, radius, ctx) <= 0;
}
function slide(player, dx, dz, radius, ctx) {
  const start = penetration(player.x, player.z, radius, ctx, player.id);
  const free = (x, z) => {
    const d = penetration(x, z, radius, ctx, player.id);
    return d <= 0 || d < start - 1e-4;
  };
  if (free(player.x + dx, player.z + dz)) {
    player.x += dx;
    player.z += dz;
    return;
  }
  if (free(player.x + dx, player.z)) player.x += dx;
  if (free(player.x, player.z + dz)) player.z += dz;
}
export function vehicleCircles(player, kind) {
  const shape = VEHICLE_SHAPES[kind] ?? VEHICLE_SHAPES[1];
  const sin = Math.sin(player.yaw),
    cos = Math.cos(player.yaw);
  const circles = shape.offsets.map((offset, i) => [
    player.x + sin * offset + cos * (shape.lateral?.[i] ?? 0),
    player.z + cos * offset - sin * (shape.lateral?.[i] ?? 0),
    shape.radii?.[i] ?? shape.r,
  ]);
  const trailer = player.trailer ?? player.yaw;
  for (const offset of shape.trailer ?? [])
    circles.push([
      player.x + Math.sin(trailer) * offset,
      player.z + Math.cos(trailer) * offset,
      shape.r,
    ]);
  return circles;
}
function vehicleDepth(player, kind, ctx) {
  if (kind === 4) return 0; // Dirigível voa acima dos obstáculos.
  let d = 0;
  for (const [x, z, r] of vehicleCircles(player, kind)) d += penetration(x, z, r, ctx, player.id);
  return d;
}
/** Valida a pose inteira para retomar sem nascer dentro de um sólido. */
export function canOccupyPlayer(player, ctx) {
  if (!Number.isFinite(player.x) || !Number.isFinite(player.z) || !Number.isFinite(player.yaw))
    return false;
  if (player.spectator) return true;
  const kind = player.vehicle
    ? typeof player.vehicle === 'object'
      ? finite(player.vehicle.kind, player.mode)
      : player.mode
    : 0;
  return kind
    ? vehicleDepth(player, kind, ctx) <= 0
    : canOccupy(player.x, player.z, constants.PLAYER_RADIUS, ctx);
}
/** Varre posição e rotação, inclusive reboque; permite sair de uma sobreposição antiga. */
export function canTraversePlayer(from, to, ctx) {
  const kind = from.vehicle
    ? typeof from.vehicle === 'object'
      ? finite(from.vehicle.kind, from.mode)
      : from.mode
    : 0;
  const depth = (p) =>
    kind ? vehicleDepth(p, kind, ctx) : penetration(p.x, p.z, constants.PLAYER_RADIUS, ctx, p.id);
  const turn = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
  const trailerTurn = Math.atan2(
    Math.sin((to.trailer ?? to.yaw) - (from.trailer ?? from.yaw)),
    Math.cos((to.trailer ?? to.yaw) - (from.trailer ?? from.yaw)),
  );
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.1),
    Math.ceil(Math.max(Math.abs(turn), Math.abs(trailerTurn)) / 0.025),
  );
  let prior = depth(from);
  for (let i = 1; i <= steps; i++) {
    const ratio = i / steps,
      p = {
        ...to,
        x: from.x + (to.x - from.x) * ratio,
        z: from.z + (to.z - from.z) * ratio,
        yaw: from.yaw + turn * ratio,
        trailer: (from.trailer ?? from.yaw) + trailerTurn * ratio,
      };
    const next = depth(p);
    if (next > prior + 1e-6) return false;
    prior = next;
  }
  return true;
}
function applyVehicleMotion(player, next, kind, ctx) {
  const before = vehicleDepth(player, kind, ctx);
  if (vehicleDepth(next, kind, ctx) <= before + 1e-6) Object.assign(player, next);
  else {
    // Conserva o esterço quando possível e desliza nos eixos livres.
    const rotated = { ...player, yaw: next.yaw, trailer: next.trailer };
    if (vehicleDepth(rotated, kind, ctx) <= before + 1e-6) {
      player.yaw = next.yaw;
      if (next.trailer !== undefined) player.trailer = next.trailer;
    }
    const oldX = player.x,
      oldZ = player.z;
    for (const axis of ['x', 'z']) {
      const candidate = { ...player, [axis]: next[axis] };
      if (vehicleDepth(candidate, kind, ctx) <= before + 1e-6) player[axis] = next[axis];
    }
    const desired = Math.hypot(next.x - oldX, next.z - oldZ),
      actual = Math.hypot(player.x - oldX, player.z - oldZ);
    player.speed = desired > 1e-6 ? next.speed * Math.min(1, actual / desired) : 0;
  }
}
function vehicleStep(player, input, dt, kind, ctx) {
  if (player.raceFrozen) {
    player.speed = 0;
    return;
  }
  if (kind === 4) {
    player.yaw -= input.x * 0.32 * dt;
    player.speed += (input.z * (input.z < 0 ? 2 : 7) - player.speed) * (1 - Math.exp(-1.5 * dt));
    player.x = clamp(player.x + Math.sin(player.yaw) * player.speed * dt, -26, 26);
    player.z = clamp(player.z + Math.cos(player.yaw) * player.speed * dt, -630, 630);
    return;
  }
  const tuning = VEHICLE_TUNING[player.race ? 1 : kind] ?? VEHICLE_TUNING[1];
  const braking = input.z * player.speed < 0;
  const factor = braking ? tuning.brake : input.z === 0 ? tuning.coast : tuning.accel;
  const top =
    input.z < 0 ? tuning.reverse : [9, 10, 11].includes(kind) && input.run ? 8.5 : tuning.forward;
  const speed = player.speed + (input.z * top - player.speed) * (1 - Math.exp(-factor * dt));
  const yaw =
    player.yaw -
    input.x * tuning.steer * Math.sign(speed) * Math.min(1, Math.abs(speed) / tuning.grip) * dt;
  const next = {
    ...player,
    yaw,
    speed: Math.abs(speed) < 0.015 ? 0 : speed,
    x: player.x + Math.sin(yaw) * speed * dt,
    z: player.z + Math.cos(yaw) * speed * dt,
  };
  if (kind === 3) {
    let trailer = finite(player.trailer, player.yaw);
    trailer += (speed / 8.6) * Math.sin(yaw - trailer) * dt;
    const diff = Math.atan2(Math.sin(yaw - trailer), Math.cos(yaw - trailer));
    if (Math.abs(diff) > 1.25) trailer = yaw - Math.sign(diff) * 1.25;
    next.trailer = trailer;
  }
  applyVehicleMotion(player, next, kind, ctx);
}
/** Integra o ator em segundos. Entradas não finitas são ignoradas e dt é limitado. */
export function stepPlayer(player, input = {}, dt = 0, ctx = {}) {
  dt = clamp(finite(dt), 0, constants.MAX_DT);
  if (!dt) return player;
  const normalized = {
    x: clamp(finite(input.x), -1, 1),
    z: clamp(finite(input.z), -1, 1),
    run: !!input.run,
  };
  player.x = finite(player.x);
  player.z = finite(player.z);
  player.yaw = finite(player.yaw);
  player.speed = finite(player.speed);
  const kind = player.vehicle
    ? typeof player.vehicle === 'object'
      ? finite(player.vehicle.kind, player.mode)
      : player.mode
    : 0;
  const steps = Math.max(1, Math.ceil(dt / constants.FIXED_DT - 1e-6)),
    subDt = dt / steps;
  if (kind) for (let i = 0; i < steps; i++) vehicleStep(player, normalized, subDt, kind, ctx);
  else {
    player.mode = 0;
    const length = Math.hypot(normalized.x, normalized.z),
      scale = length > 1 ? 1 / length : 1;
    const speed = normalized.run ? constants.RUN_SPEED : constants.WALK_SPEED;
    const oldX = player.x,
      oldZ = player.z;
    for (let i = 0; i < steps; i++)
      slide(
        player,
        normalized.x * scale * speed * subDt,
        normalized.z * scale * speed * subDt,
        constants.PLAYER_RADIUS,
        ctx,
      );
    player.speed = Math.hypot(player.x - oldX, player.z - oldZ) / dt;
    if (player.speed > 0.05) player.yaw = Math.atan2(normalized.x, normalized.z);
  }
  return player;
}
export function spawnForTeam(team = 0, ctx, actor) {
  const free = (x, z) =>
    actor
      ? canOccupyPlayer({ ...actor, x, z, yaw: 0 }, ctx)
      : canOccupy(x, z, constants.PLAYER_RADIUS, ctx);
  const centerZ = [28, 36, 44][clamp(Math.trunc(finite(Number(team))), 0, 2)];
  for (let ring = 0; ring < 15; ring++)
    for (const direction of [0, 1, -1]) {
      const x = -8 + direction * ring,
        z = centerZ + ring;
      if (free(x, z)) return { x, z, yaw: 0, speed: 0, mode: 0 };
    }
  if (free(0, 100) || (!ctx && !actor)) return { x: 0, z: 100, yaw: 0, speed: 0, mode: 0 };
  return null;
}
