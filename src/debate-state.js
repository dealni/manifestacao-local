import { stopStageVoice } from './stage-voice.js';
import { relocateWorldPlayer } from './attractions.js';

export const sentFrames = new WeakMap();
export const sessions = (ctx) => (ctx.debateSessions ??= new Map());
export const expulsions = (ctx) => (ctx.debateExpulsions ??= new Map());
export const identity = (p) => p.userId ?? p.user?.id ?? p.account?.id;
export const participantKey = (p) =>
  identity(p) != null ? `account:${identity(p)}` : `guest:${p.id}`;
export const expelled = (p, s, ctx) => expulsions(ctx).get(s?.id)?.has(participantKey(p)) ?? false;
export function closeSession(s, ctx) {
  sessions(ctx).delete(s.id);
  expulsions(ctx).delete(s.id);
  for (const q of players(ctx)) if (q.debateRemote === s.id) q.debateRemote = null;
}
export const players = (ctx) => [...(ctx.players?.values() ?? [])];
export const send = (p, ctx, m) => ctx.sendPlayer(p, m);
export const note = (p, ctx, text) => send(p, ctx, { t: 'notice', text });
export const distance = (p, s) => Math.hypot(p.x - s.x, p.z - s.z);
export const seat = (p) => ({ id: p.id, nick: p.nick });
export const bounded = (v, min, max, fallback) =>
  Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
export const topic = (value) =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex -- Remove ou rejeita controles ASCII recebidos do usuário.
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 160);
export function allowedPlace(x, z) {
  return (
    (Math.abs(x + 40.15) <= 30.16 / 2 - 4.5 && Math.abs(z + 27.93) <= 71.15 / 2 - 4.5) ||
    [
      [37.11, 139.28, -143.45, 7.09],
      [30.59, 144.45, -351.71, -299.56],
    ].some(([a, b, c, d]) => x >= a + 4.5 && x <= b - 4.5 && z >= c + 4.5 && z <= d - 4.5)
  );
}
export const mine = (p, ctx) =>
  [...sessions(ctx).values()].find((s) => s.host.id === p.id || s.guest?.id === p.id);
export function publicList(all, connected) {
  return all.map((s) => ({
    ...s,
    listeners: connected.filter(
      (q) =>
        q.id !== s.host.id &&
        q.id !== s.guest?.id &&
        !q.debateListeningOff &&
        (q.debateRemote === s.id || distance(q, s) <= 9),
    ).length,
  }));
}
export function snapshots(p, ctx, shared) {
  const all = shared?.all ?? [...sessions(ctx).values()];
  const selected =
    mine(p, ctx) ?? sessions(ctx).get(p.debateRemote) ?? all.find((s) => distance(p, s) <= 9);
  const role =
    selected?.host.id === p.id ? 'host' : selected?.guest?.id === p.id ? 'guest' : 'listener';
  const publicSessions = shared?.publicSessions ?? publicList(all, players(ctx));
  return [
    {
      t: 'cm_state',
      available: all.length < 30,
      at: Date.now(),
      sessions: publicSessions,
      session: publicSessions.find((s) => s.id === selected?.id),
    },
    {
      t: 'cm_me',
      role,
      blocked: expelled(p, selected, ctx),
      queued: all.some((s) => s.queue.some((q) => q.id === p.id)),
      premium: true,
      remote: p.debateRemote ?? null,
      listeningOff: !!p.debateListeningOff,
      browsing: !!p.debateBrowsing,
    },
  ];
}
export function initDebate(p, ctx) {
  return snapshots(p, ctx);
}
export function updateDebate(ctx) {
  for (const s of sessions(ctx).values())
    if (s.endsAt && s.endsAt <= Date.now()) {
      s.endsAt = null;
      s.remaining = 0;
      s.timerActive = false;
    }
  const all = [...sessions(ctx).values()],
    connected = players(ctx);
  const shared = { all, publicSessions: publicList(all, connected) };
  // A lista compartilhada é serializada uma vez, mesmo em salas com muitos participantes.
  const publicKey = JSON.stringify(shared.publicSessions);
  for (const p of connected) sendSnapshots(p, ctx, shared, publicKey);
}
export function sendSnapshots(p, ctx, shared, publicKey) {
  const previous = sentFrames.get(p) ?? new Map();
  for (const m of snapshots(p, ctx, shared)) {
    const key =
      m.t === 'cm_state'
        ? JSON.stringify([m.available, publicKey ?? JSON.stringify(m.sessions), m.session?.id])
        : JSON.stringify(m);
    if (previous.get(m.t) === key) continue;
    previous.set(m.t, key);
    send(p, ctx, m);
  }
  sentFrames.set(p, previous);
}
export function clearParticipant(p, ctx) {
  for (const s of sessions(ctx).values()) {
    if (s.host.id === p.id) {
      closeSession(s, ctx);
    } else {
      if (s.guest?.id === p.id) s.guest = null;
      s.queue = s.queue.filter((q) => q.id !== p.id);
    }
  }
}
export function cleanupDebate(p, ctx) {
  if (!sessions(ctx).size) return;
  clearParticipant(p, ctx);
  updateDebate(ctx);
}
export function seatPlayer(p, s, index, ctx) {
  ctx.releaseVehicleSeats?.(p);
  const offset = index === 0 ? -1.32 : 1.32;
  p.x = s.x + Math.cos(s.yaw) * offset;
  p.z = s.z - Math.sin(s.yaw) * offset;
  p.yaw = s.yaw + (index === 0 ? Math.PI / 2 : -Math.PI / 2);
  p.vehicle = 0;
  p.mode = 0;
  delete p.stageDeck;
  stopStageVoice(p, ctx);
  relocateWorldPlayer(p, ctx, p.x, p.z);
}
