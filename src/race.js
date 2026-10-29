/** Corrida reconstruída do consumidor público $Y/VY/eC; não utiliza serviço externo. */
import { relocateWorldPlayer } from './attractions.js';
export const RACE_START = Object.freeze({ x: 0, z: -400 });
const eligible = (p) => [1, 5, 7, 8].includes(p?.mode);
const accountId = (player) => player?.userId ?? player?.user?.id ?? null;
const identity = (player) =>
  accountId(player) !== null ? `account:${accountId(player)}` : `guest:${player?.id}`;
const entryIdentity = (row) =>
  row.entryId ??
  (row.accountId !== null && row.accountId !== undefined
    ? `account:${row.accountId}`
    : `guest:${row.id}`);
const controls = (ctx) => ({ queue: 300000, countdown: 10000, racing: 1500000, ...ctx.raceConfig });

// Mesmas ruas, interpolação e portais arredondados do bundle original.
export const RACE_GATES = (() => {
  const route = [
    [0, -599.62, 'Avenida Paulista'],
    [151.78, -599.62, 'Rua Augusta'],
    [151.78, -463.21, 'Alameda Santos'],
    [0, -463.21, 'Rua Padre João Manuel'],
    [0, -290.39, 'Avenida Paulista'],
    [151.78, -290.39, 'Alameda Ministro Rocha Azevedo'],
    [151.78, -157.66, 'Alameda Santos'],
    [151.78, 21.75, 'Alameda Santos'],
    [151.78, 303.67, 'Alameda Santos'],
    [0, 303.67, 'Rua Pamplona'],
    [0, 122.5, 'Avenida Paulista'],
    [-111.5, 131.4, 'Rua Itapeva'],
    [-111.5, -157.66, 'Rua Carlos Comenale'],
    [0, -157.66, 'Rua Peixoto Gomide'],
    [0, -400, 'Avenida Paulista'],
  ];
  const points = [];
  let prior = RACE_START;
  for (const [x, z, street] of route) {
    const count = Math.max(1, Math.floor(Math.hypot(x - prior.x, z - prior.z) / 140));
    const width = Math.min(
      7,
      (street === 'Avenida Paulista'
        ? 14
        : street === 'Rua Itapeva' || street === 'Rua Padre João Manuel'
          ? 3.7
          : street === 'Rua Carlos Comenale'
            ? 5
            : 5.35) - 0.6,
    );
    for (let i = 1; i <= count; i++)
      points.push({
        x: prior.x + ((x - prior.x) * i) / count,
        z: prior.z + ((z - prior.z) * i) / count,
        width,
        street,
        yaw: Math.atan2(x - prior.x, z - prior.z),
      });
    prior = { x, z };
  }
  return Object.freeze(
    points.map((p, i) => {
      const a = points[i - 1] ?? RACE_START,
        b = points[i + 1];
      if (!b) return Object.freeze(p);
      const incoming = Math.atan2(p.x - a.x, p.z - a.z),
        outgoing = Math.atan2(b.x - p.x, b.z - p.z),
        turn = Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming));
      if (Math.abs(turn) < 0.1) return Object.freeze(p);
      const width = Math.min(p.width, b.width),
        r = Math.max(7, (width - 0.8) * 2),
        d = Math.min(
          10,
          r,
          Math.hypot(p.x - a.x, p.z - a.z) * 0.2,
          Math.hypot(b.x - p.x, b.z - p.z) * 0.2,
        );
      return Object.freeze({
        ...p,
        width,
        x: p.x + ((-Math.sin(incoming) + Math.sin(outgoing)) * d) / 4,
        z: p.z + ((-Math.cos(incoming) + Math.cos(outgoing)) * d) / 4,
        yaw: incoming + turn / 2,
      });
    }),
  );
})();
function state(ctx, now = Date.now()) {
  if (!ctx.race)
    ctx.race = {
      id: 1,
      phase: 'queue',
      until: now + controls(ctx).queue,
      rows: [],
      previous: [],
      startedAt: 0,
      lastBroadcast: 0,
    };
  return ctx.race;
}
function globals(ctx) {
  return (ctx.state?.users ?? [])
    .filter((u) => u.raceStats?.finishes)
    .map((u) => ({ id: u.id, nick: u.nick, ...u.raceStats }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins)
    .slice(0, 100);
}
function snapshot(ctx) {
  const r = state(ctx);
  return {
    t: 'race',
    id: r.id,
    phase: r.phase,
    until: r.until,
    checkpoints: RACE_GATES.length,
    laps: 1,
    rows: r.rows.map(({ accountId, entryId, lastX, lastZ, ...row }) => ({ ...row })),
    previous: r.previous,
    global: globals(ctx),
  };
}
function emit(ctx, now = Date.now()) {
  const r = state(ctx);
  r.lastBroadcast = now;
  ctx.broadcast?.(snapshot(ctx));
}
function notice(ctx, p, text) {
  ctx.sendPlayer?.(p, { t: 'notice', text });
}
const racer = (ctx, id) => ctx.players?.get(id) ?? ctx.resumePlayer?.(id);
const ownsEntry = (player, row) => !!player && identity(player) === entryIdentity(row);
export function initRace(player, ctx) {
  const r = state(ctx),
    row = r.rows.find((row) => row.id === player.id);
  if (row && ownsEntry(player, row) && ['queued', 'racing'].includes(row.status)) {
    player.race = r.phase !== 'queue';
    player.raceFrozen = r.phase === 'countdown';
    // A contagem pode ter alinhado o jogador enquanto seu socket estava fechado.
    if (r.phase === 'countdown')
      Object.assign(player, { x: row.lastX, z: row.lastZ, yaw: Math.PI, speed: 0 });
    row.lastX = player.x;
    row.lastZ = player.z;
    r.offline?.delete(row.id);
  }
  return snapshot(ctx);
}
export function handleRaceMessage(player, msg, ctx) {
  if (msg.t !== 'race') return false;
  const now = Date.now(),
    r = state(ctx, now),
    index = r.rows.findIndex((row) => row.id === player.id);
  if (msg.action === 'leave') {
    if (index >= 0) {
      if (r.phase === 'queue') r.rows.splice(index, 1);
      else if (['queued', 'racing'].includes(r.rows[index].status)) r.rows[index].status = 'dnf';
    }
    r.offline?.delete(player.id);
    player.race = false;
    player.raceFrozen = false;
    emit(ctx, now);
    return true;
  }
  if (msg.action !== 'join') return true;
  if (index >= 0) return true;
  if (r.phase !== 'queue') {
    notice(ctx, player, 'Aguarde a próxima fila de corrida.');
    return true;
  }
  if (!eligible(player)) {
    notice(ctx, player, 'Fique ao volante de carro, carro de som, moto ou chopper.');
    return true;
  }
  if (accountId(player) === null && ctx.freeAccess !== true) {
    notice(ctx, player, 'Entre na sua conta local para salvar a classificação.');
    return true;
  }
  if (r.rows.some((row) => entryIdentity(row) === identity(player))) {
    notice(ctx, player, 'Sua conta já está inscrita nesta corrida.');
    return true;
  }
  if (r.rows.length >= 24) {
    notice(ctx, player, 'A fila está cheia: máximo de 24 pilotos.');
    return true;
  }
  ctx.releaseVehicleSeats?.(player);
  r.rows.push({
    id: player.id,
    accountId: accountId(player),
    entryId: identity(player),
    nick: player.nick,
    status: 'queued',
    checkpoint: 0,
    lap: 0,
    time: 0,
    points: 0,
  });
  emit(ctx, now);
  return true;
}
function closeRace(ctx, now) {
  const r = state(ctx);
  r.previous = r.rows.map(({ accountId, entryId, lastX, lastZ, ...row }) => ({
    ...row,
    status: ['queued', 'racing'].includes(row.status) ? 'dnf' : row.status,
  }));
  for (const row of r.rows) {
    const p = racer(ctx, row.id);
    if (p) {
      p.race = false;
      p.raceFrozen = false;
    }
  }
  r.offline?.clear();
  r.rewardedAccounts?.clear();
  r.rows = [];
  r.phase = 'queue';
  r.until = now + controls(ctx).queue;
  r.id++;
  emit(ctx, now);
}
function finish(ctx, row, now) {
  const r = state(ctx),
    p = ctx.players?.get(row.id),
    place = r.rows.filter((p) => p.status === 'finished').length;
  if (!p || !ownsEntry(p, row)) {
    row.status = 'dnf';
    return;
  }
  const rewarded = (r.rewardedAccounts ??= new Set());
  if (
    rewarded.has(entryIdentity(row)) ||
    r.rows.some(
      (other) =>
        other !== row && entryIdentity(other) === entryIdentity(row) && other.status === 'finished',
    )
  ) {
    row.status = 'dnf';
    p.race = false;
    p.raceFrozen = false;
    return;
  }
  rewarded.add(entryIdentity(row));
  row.status = 'finished';
  row.time = Math.max(0, now - r.startedAt);
  row.points = [100, 80, 65][place] ?? Math.max(20, 55 - (place - 3) * 5);
  row.lap = 1;
  const user =
    row.accountId === null || row.accountId === undefined
      ? null
      : ctx.state?.users?.find((u) => String(u.id) === String(row.accountId));
  if (user) {
    const stats = (user.raceStats ??= { points: 0, wins: 0, finishes: 0 });
    stats.points += row.points;
    stats.wins += place === 0 ? 1 : 0;
    stats.finishes++;
    ctx.save?.();
  }
  if (p) {
    p.race = false;
    p.raceFrozen = false;
  }
  ctx.onRaceFinish?.(p, { ...row, place: place + 1 });
}
function nearSegment(p, row, gate) {
  const x = row.lastX ?? p.x,
    z = row.lastZ ?? p.z,
    dx = p.x - x,
    dz = p.z - z,
    den = dx * dx + dz * dz;
  const fraction = den
    ? Math.max(0, Math.min(1, ((gate.x - x) * dx + (gate.z - z) * dz) / den))
    : 0;
  return Math.hypot(x + fraction * dx - gate.x, z + fraction * dz - gate.z) <= gate.width + 2;
}
function removeIneligibleRacers(ctx, r) {
  let changed = false;
  for (const row of r.rows) {
    const p = racer(ctx, row.id);
    if (['queued', 'racing'].includes(row.status) && (!p || !eligible(p) || !ownsEntry(p, row))) {
      if (r.phase === 'queue') {
        r.rows = r.rows.filter((q) => q !== row);
      } else row.status = 'dnf';
      if (p) {
        p.race = false;
        p.raceFrozen = false;
      }
      changed = true;
    }
  }
  return changed;
}

function advanceCheckpoints(ctx, r, now) {
  let changed = false;
  for (const row of r.rows) {
    if (row.status !== 'racing') continue;
    const p = ctx.players.get(row.id),
      gate = RACE_GATES[row.checkpoint];
    if (!p) {
      (r.offline ??= new Set()).add(row.id);
      continue;
    }
    if (r.offline?.delete(row.id)) {
      row.lastX = p.x;
      row.lastZ = p.z;
    }
    if (gate && nearSegment(p, row, gate)) {
      row.checkpoint++;
      if (row.checkpoint === RACE_GATES.length) finish(ctx, row, now);
      changed = true;
    }
    row.lastX = p.x;
    row.lastZ = p.z;
  }
  return changed;
}

function advanceRacePhase(ctx, r, now) {
  let changed = false;
  if (r.phase === 'queue' && now >= r.until) {
    if (!r.rows.length) {
      r.until = now + controls(ctx).queue;
      changed = true;
    } else {
      r.phase = 'countdown';
      r.until = now + controls(ctx).countdown;
      r.rows.forEach((row, i) => {
        const p = racer(ctx, row.id);
        // A janela de reconexão pode expirar entre a validação e o alinhamento.
        if (!p || !eligible(p) || !ownsEntry(p, row)) {
          row.status = 'dnf';
          return;
        }
        Object.assign(p, {
          x: ((i % 3) - 1) * 3.2,
          z: -400 + Math.floor(i / 3) * 6,
          yaw: Math.PI,
          speed: 0,
          input: { x: 0, z: 0, run: false },
          lastPoseAt: 0,
          race: true,
          raceFrozen: true,
        });
        row.lastX = p.x;
        row.lastZ = p.z;
        if (ctx.players?.has(row.id)) relocateWorldPlayer(p, ctx, p.x, p.z, now);
        else p.worldPrevious = { x: p.x, z: p.z, at: now };
      });
      changed = true;
    }
  } else if (r.phase === 'countdown' && now >= r.until) {
    r.phase = 'racing';
    r.startedAt = now;
    r.until = now + controls(ctx).racing;
    for (const row of r.rows) {
      if (row.status === 'queued') row.status = 'racing';
      const p = racer(ctx, row.id);
      if (p) p.raceFrozen = false;
    }
    changed = true;
  }
  return changed;
}

export function tickRace(ctx, now = Date.now()) {
  const r = state(ctx, now);
  let changed = removeIneligibleRacers(ctx, r);
  changed = advanceRacePhase(ctx, r, now) || changed;
  if (r.phase === 'racing') {
    if (now >= r.until) {
      closeRace(ctx, now);
      return;
    }
    changed = advanceCheckpoints(ctx, r, now) || changed;
    r.rows.sort(
      (a, b) =>
        (a.status === 'finished' ? 0 : 1) - (b.status === 'finished' ? 0 : 1) ||
        (a.status === 'finished' ? a.time - b.time : b.checkpoint - a.checkpoint),
    );
    if (now >= r.until || !r.rows.some((row) => row.status === 'racing')) {
      closeRace(ctx, now);
      return;
    }
  }
  if (r.phase === 'countdown' && !r.rows.some((row) => row.status === 'queued')) {
    closeRace(ctx, now);
    return;
  }
  if (changed || now - r.lastBroadcast >= 1000) emit(ctx, now);
}
