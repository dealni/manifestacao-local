import { readFileSync } from 'node:fs';
import { canOccupyPlayer, spawnForTeam, vehicleCircles } from '../src/simulation.js';
import { RACE_GATES, RACE_START } from '../src/race.js';

const places = JSON.parse(
  readFileSync(new URL('../src/world-data.json', import.meta.url), 'utf8'),
).places;
const entrances = places.flatMap((p) =>
  (p.actions ?? []).map((a) => ({ x: p.x + a.x, z: p.z + a.z, r: (a.radius ?? 3) + 4 })),
);
const spawns = [0, 1, 2].map(spawnForTeam);
const handheldFlags = [21, 22, 23, 24, 25, 26];
const displayWeapons = ['dialogo', 'foam', 'pillow', 'fish', 'blades'];
// Mantém os veículos centrais em grupos separados por time.
export const AMBIENT_SOUND_TEAM_GAP = 80;
const soundKind = (kind) => kind === 5 || kind === 6;
const soundZones = [
  {
    x0: -40,
    x1: 40,
    min: -150,
    max: -90,
    slots: [
      [-40, -140],
      [40, -140],
      [-40, -105],
      [40, -105],
    ],
  },
  {
    x0: -40,
    x1: 40,
    min: -15,
    max: 45,
    slots: [
      [-40, -10],
      [40, -10],
      [-40, 30],
    ],
  },
  {
    x0: -40,
    x1: 40,
    min: 120,
    max: 165,
    slots: [
      [-40, 125],
      [40, 125],
      [-40, 160],
      [40, 160],
    ],
  },
];
function segmentDistance(p, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
/** Mantém figuras fora do corredor de corrida, saídas e acessos interativos. */
export function ambientPositionAllowed(p, margin = 0) {
  if (
    !canOccupyPlayer({
      ...p,
      id: -9000,
      yaw: p.yaw ?? 0,
      mode: p.mode ?? 0,
      vehicle: p.vehicle ?? 0,
    })
  )
    return false;
  if (spawns.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 10 + margin)) return false;
  if (entrances.some((a) => Math.hypot(a.x - p.x, a.z - p.z) < a.r + margin)) return false;
  let prior = RACE_START;
  for (const gate of RACE_GATES) {
    if (segmentDistance(p, prior, gate) < Math.max(10, gate.width + 5) + margin) return false;
    prior = gate;
  }
  return true;
}
function clearOfVehicles(p, vehicles) {
  return vehicles.every(
    (v) =>
      v.kind === 4 ||
      (Math.hypot(v.x - p.x, v.z - p.z) >= 9 &&
        vehicleCircles(v, v.kind).every(([x, z, r]) => Math.hypot(x - p.x, z - p.z) > r + 2)),
  );
}
function routeAllowed(a, b, vehicles = []) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
  for (let i = 0; i <= steps; i++)
    if (
      !ambientPositionAllowed({
        x: a.x + ((b.x - a.x) * i) / steps,
        z: a.z + ((b.z - a.z) * i) / steps,
      }) ||
      !clearOfVehicles(
        { x: a.x + ((b.x - a.x) * i) / steps, z: a.z + ((b.z - a.z) * i) / steps },
        vehicles,
      )
    )
      return false;
  return true;
}
function flagAppearance(i, team) {
  const flag =
    i % 4 === 0
      ? [1, 11, 18][team]
      : i % 4 === 1
        ? handheldFlags[Math.floor(i / 4) % handheldFlags.length]
        : 0;
  return (
    (i % 6) |
    (((i * 3) % 6) << 3) |
    (((i * 5) % 6) << 6) |
    ((flag & 15) << 12) |
    (((flag >> 4) & 1) << 19)
  );
}
function ambientVehicleSpotAllowed(spot, request, vehicles, preferred, zone) {
  const isSound = soundKind(request.kind);
  if (isSound && spot.x !== preferred[0]) return false;
  if (isSound && (spot.z < zone.min || spot.z > zone.max || spot.x < zone.x0 || spot.x > zone.x1))
    return false;
  if (
    isSound &&
    vehicles.some(
      (other) =>
        soundKind(other.kind) &&
        other.team !== request.team &&
        Math.hypot(other.x - spot.x, other.z - spot.z) < AMBIENT_SOUND_TEAM_GAP,
    )
  )
    return false;
  return true;
}

function selectAmbientVehicle(i, request, vehicles, preferred, zone, spots) {
  for (const spot of spots) {
    if (!ambientVehicleSpotAllowed(spot, request, vehicles, preferred, zone)) continue;
    const v = {
      id: -1001 - i,
      kind: request.kind,
      team: request.team,
      x: spot.x,
      z: spot.z,
      yaw: spot.x < 0 ? 0 : Math.PI,
      speed: 0,
      ...(request.alt ? { alt: request.alt } : {}),
    };
    const pose = { ...v, mode: v.kind, vehicle: v.id };
    if (!ambientPositionAllowed(pose, 3)) continue;
    const footprint = vehicleCircles(pose, v.kind);
    if (v.kind !== 4 && !footprint.every(([x, z, r]) => ambientPositionAllowed({ x, z }, r)))
      continue;
    if (
      vehicles.some((other) =>
        vehicleCircles(other, other.kind).some(([x, z, r]) =>
          footprint.some(([nx, nz, nr]) => Math.hypot(nx - x, nz - z) < r + nr + 2),
        ),
      )
    )
      continue;
    return v;
  }
}

function buildAmbientVehicles() {
  const vehicles = [];
  const desired = [
    { kind: 5, team: 0, x: -24, z: 62 },
    { kind: 6, team: 1, x: 25, z: 178 },
    { kind: 5, team: 2, x: -25, z: -220 },
    { kind: 1, team: 0, x: 26, z: 260 },
    { kind: 1, team: 2, x: -26, z: -330 },
    { kind: 7, team: 1, x: 27, z: 65 },
    { kind: 7, team: 0, x: -26, z: 355 },
    { kind: 7, team: 2, x: 25, z: -105 },
    { kind: 8, team: 0, x: -27, z: 130 },
    { kind: 13, team: 1, x: 28, z: -160 },
    { kind: 12, team: 2, x: -28, z: 295 },
    { kind: 3, team: 0, x: -40, z: -440 },
    { kind: 4, team: 2, x: -210, z: 420, alt: 35 },
    { kind: 9, team: 1, x: 30, z: 430 },
    { kind: 10, team: 2, x: -30, z: -270 },
    { kind: 11, team: 0, x: 30, z: -510 },
  ];
  // Três palcos móveis de cada time; preserva também os carros e demais veículos.
  for (const team of [0, 1, 2])
    for (
      let count = desired.filter((v) => v.kind === 6 && v.team === team).length;
      count < 3;
      count++
    )
      desired.push({
        kind: 6,
        team,
        x: count % 2 === 0 ? -40 : 40,
        z: [110, -250, 390][team] + count * 80,
      });
  const soundSlots = [0, 0, 0];
  for (const [i, request] of desired.entries()) {
    const isSound = soundKind(request.kind),
      zone = isSound ? soundZones[request.team] : null;
    const preferred = isSound ? zone.slots[soundSlots[request.team]++] : [request.x, request.z];
    const spots = [0, 8, -8, 16, -16, 24, -24, 40, -40].map((dz) => ({
      x: preferred[0],
      z: preferred[1] + dz,
    }));
    if (isSound) for (let z = zone.min; z <= zone.max; z += 4) spots.push({ x: preferred[0], z });
    for (let z = -560; z <= 560; z += 20)
      for (const x of [-26, 26, -40, 40, -170, 170, -200, 200]) spots.push({ x, z });
    const selected = selectAmbientVehicle(i, request, vehicles, preferred, zone, spots);
    if (!selected) throw Error(`Sem posição livre para veículo ambiental ${i}`);
    vehicles.push(selected);
  }
  return vehicles;
}

function ambientActorDestination(candidate, i, vehicles) {
  let end = { ...candidate };
  if (i % 3 !== 0)
    for (const delta of [
      { x: 0, z: 3 },
      { x: 2, z: 0 },
      { x: 0, z: -3 },
      { x: -2, z: 0 },
    ]) {
      const next = { x: candidate.x + delta.x, z: candidate.z + delta.z };
      if (routeAllowed(candidate, next, vehicles)) {
        end = next;
        break;
      }
    }
  return end;
}

export function buildAmbientPopulation() {
  const vehicles = buildAmbientVehicles();
  const actors = [],
    candidates = [];
  // A região inicial recebe pequenos grupos; o restante acompanha as calçadas do eixo.
  for (const z of [
    8, 24, 50, 66, 90, 114, 150, 174, -94, -118, -190, -214, 230, 254, 350, 374, -350, -374, 470,
    -470, 530, -530,
  ])
    for (const x of [-22, 22, -28, 28, -35, 35]) candidates.push({ x, z });
  for (let z = -570; z <= 570; z += 14)
    for (const x of [-22, 22, -29, 29, -36, 36, -170, 170, -190, 190]) candidates.push({ x, z });
  for (const candidate of candidates) {
    if (actors.length === 200) break;
    if (!ambientPositionAllowed(candidate, 1.5)) continue;
    if (actors.some((p) => Math.hypot(p.x - candidate.x, p.z - candidate.z) < 3)) continue;
    if (!clearOfVehicles(candidate, vehicles)) continue;
    const i = actors.length,
      team = i % 3;
    const ambientWeapon =
      i % 4 === 3 ? displayWeapons[Math.floor(i / 4) % displayWeapons.length] : null;
    const end = ambientActorDestination(candidate, i, vehicles);
    actors.push({
      id: -1 - i,
      x: candidate.x,
      z: candidate.z,
      toX: end.x,
      toZ: end.z,
      yaw: (i * 0.73) % (Math.PI * 2),
      speed: 0,
      character: i % 5,
      ...(ambientWeapon ? { ambientWeapon } : {}),
      team,
      shirt: [1, 5, 9][team],
      appearance: flagAppearance(i, team),
      mode: 0,
      vehicle: 0,
      emote: [0, 1, 2, 3, 4][i % 5],
      phase: (i * 1.618) % 20,
    });
  }
  if (actors.length !== 200) throw Error(`População ambiental incompleta: ${actors.length}`);
  const sources = vehicles
    .filter((v) => v.kind === 5 || v.kind === 6)
    .map((v, i) => ({
      p: -2001 - i,
      v: v.id,
      team: v.team,
      item: v.kind === 6 ? 'caminhao-som' : 'carro-som',
      track: ['d5', 'e5', 'm1'][v.team],
      at: 0,
      volume: 0.3,
      level: 0.3,
    }));
  return { actors, vehicles, sources };
}

/** Figurantes não entram na rede, na física, nas contas nem nos mapas de nomes. */
export function createAmbientPopulation(config, { mobile = false } = {}) {
  const vehicles = config.vehicles.map((v) => ({ ...v })),
    byId = new Map(vehicles.map((v) => [v.id, v]));
  let stamp, frame, focusX, focusZ;
  function positionActor(original, time) {
    const dx = original.toX - original.x,
      dz = original.toZ - original.z,
      distance = Math.hypot(dx, dz),
      travel = distance / 0.8,
      pause = 4,
      period = travel * 2 + pause * 2;
    const t = (((time + original.phase) % period) + period) % period;
    let fraction = 0,
      walking = false,
      reverse = false;
    if (distance > 0 && t >= pause && t < pause + travel) {
      fraction = (t - pause) / travel;
      walking = true;
    } else if (distance > 0 && t >= pause + travel && t < pause * 2 + travel) {
      fraction = 1;
    } else if (distance > 0 && t >= pause * 2 + travel) {
      fraction = 1 - (t - pause * 2 - travel) / travel;
      walking = true;
      reverse = true;
    }
    return {
      ...original,
      x: original.x + dx * fraction,
      z: original.z + dz * fraction,
      yaw: walking ? Math.atan2(reverse ? -dx : dx, reverse ? -dz : dz) : original.yaw,
      speed: walking ? 0.8 : 0,
      emote: walking ? 0 : original.emote,
    };
  }
  function sample(seconds = 0, focus) {
    let time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    // No celular a decoração atualiza a 20 Hz; jogadores continuam no ritmo original.
    if (mobile) time = Math.floor(time * 20) / 20;
    const positioned = Number.isFinite(focus?.x) && Number.isFinite(focus?.z);
    const nextFocusX = positioned ? focus.x : null,
      nextFocusZ = positioned ? focus.z : null;
    if (stamp === time && frame && (!mobile || (focusX === nextFocusX && focusZ === nextFocusZ)))
      return frame;
    const actors = new Map();
    const near = (entry, radius) =>
      positioned && Math.hypot(entry.x - focus.x, entry.z - focus.z) <= radius;
    const visibleActors = mobile
      ? config.actors
          .filter((entry) => near(entry, 80))
          .sort(
            (a, b) =>
              Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z) ||
              a.id - b.id,
          )
          .slice(0, 24)
      : config.actors;
    for (const original of visibleActors) {
      actors.set(original.id, positionActor(original, time));
    }
    stamp = time;
    focusX = nextFocusX;
    focusZ = nextFocusZ;
    frame = {
      actors,
      // Mantém os equipamentos audíveis visíveis; os demais veículos são só decoração.
      vehicles: mobile
        ? vehicles.filter((entry) => (entry.kind === 5 || entry.kind === 6) && near(entry, 160))
        : vehicles,
    };
    return frame;
  }
  return {
    sources: config.sources.map((s) => ({ ...s })),
    frame: sample,
    getVehicle: (id) => byId.get(id),
    position: (source) => (source?.v ? byId.get(source.v) : undefined),
    renderActors(real, seconds, focus) {
      return new Map([...real, ...sample(seconds, focus).actors]);
    },
    renderVehicles(real, seconds, focus) {
      return [...real, ...sample(seconds, focus).vehicles];
    },
  };
}
/** Jogadores reais mantêm prioridade e o orçamento gráfico existente. */
export function selectAmbientDetails(select, rows, self, budget, mobile, limit = Infinity) {
  const real = rows.filter((row) => row.id >= 0),
    selected = select(real, self, budget, mobile, limit);
  let cost = real
      .filter((row) => selected.has(row.id))
      .reduce((sum, row) => sum + Math.max(1, Number(row.cost) || 1), 0),
    count = 0;
  const ambient = rows
    .filter((row) => row.id < 0 && row.visible && row.eyeDistance < 40)
    .sort((a, b) => a.eyeDistance - b.eyeDistance || a.id - b.id);
  for (const row of ambient) {
    const next = Math.max(1, Number(row.cost) || 1);
    if (count >= (mobile ? 2 : 10) || selected.size >= limit) break;
    if (cost + next > budget) continue;
    selected.add(row.id);
    cost += next;
    count++;
  }
  return selected;
}
export const ambientPopulation = buildAmbientPopulation();
export function applyAmbientPopulation(source) {
  function once(before, after) {
    if (source.indexOf(before) < 0 || source.indexOf(before) !== source.lastIndexOf(before))
      throw Error(`Patch população ambiental incompatível: ${before.slice(0, 60)}`);
    source = source.replace(before, after);
  }
  once(
    'qA = (n) => (n * 0.618034) % 1',
    'qA = (n) => n >= 0 ? (n * 0.618034) % 1 : (((n * 0.618034) % 1) + 1) % 1',
  );
  once(
    'const rh = new Gj',
    `const __selectAmbientDetails = ${selectAmbientDetails.toString()};\nconst __ambientPopulation = (${createAmbientPopulation.toString()})(${JSON.stringify(ambientPopulation)}, { mobile: Ls });\nconst rh = new Gj`,
  );
  once(
    'const h = EO(d, s, this.detailBudget, this.mobile, this.detailLimit);',
    'const h = __selectAmbientDetails(EO, d, s, this.detailBudget, this.mobile, this.detailLimit);',
  );
  once(
    'const a = this.portraits.get(mt[e.character]),',
    'const a = this.portraits.get(mt[e.character]) ?? null,',
  );
  once(
    'Bt.updateOverview(Y.overview, m, Mt, i, n, sn, Y.looks, Ue && Y.far.wide)',
    'Bt.updateOverview(Y.overview, __ambientPopulation.renderActors(m, n / 1e3, Mt), Mt, i, n, sn, Y.looks, Ue && Y.far.wide)',
  );
  once(
    'Bt.updateVehicles(P, i, Mt)',
    'Bt.updateVehicles(__ambientPopulation.renderVehicles(P, n / 1e3, Mt), i, Mt)',
  );
  once(
    'Bt.update(m, Y.names, i, sn, Y.id, Mt, ot)',
    'Bt.update(__ambientPopulation.renderActors(m, n / 1e3, Mt), Y.names, i, sn, Y.id, Mt, ot)',
  );
  once(
    'const s = t ? (this.physical?.weapon(e.state.id) ?? "push") : "push";',
    'const s = t ? (e.state.id < 0 && e.state.ambientWeapon ? e.state.ambientWeapon : (this.physical?.weapon(e.state.id) ?? "push")) : "push";',
  );
  once(
    'const K = !J && !E && !b && !!this.physical?.enabled(u.id);',
    'const K = !J && !E && !b && (u.id < 0 ? !!u.ambientWeapon : !!this.physical?.enabled(u.id));',
  );
  return source;
}
