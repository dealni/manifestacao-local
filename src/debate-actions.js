import { randomUUID } from 'node:crypto';
import {
  sessions,
  expulsions,
  participantKey,
  expelled,
  closeSession,
  send,
  note,
  distance,
  seat,
  bounded,
  topic,
  allowedPlace,
  mine,
  snapshots,
  sendSnapshots,
  clearParticipant,
  seatPlayer,
} from './debate-state.js';

export function createDebate(p, msg, ctx, all) {
  if (p.spectator || p.secretRide || p.race || p.raceFrozen) {
    note(p, ctx, 'Volte ao modo de caminhada antes de sentar em uma mesa.');
    return false;
  }
  const x = Number(msg.x),
    z = Number(msg.z),
    yaw = Number(msg.yaw),
    text = topic(msg.topic);
  if (mine(p, ctx)) {
    note(p, ctx, 'Saia da cadeira atual antes de abrir outra mesa.');
    return false;
  }
  if (
    ![x, z, yaw].every(Number.isFinite) ||
    !allowedPlace(x, z) ||
    Math.hypot(p.x - x, p.z - z) > 6
  ) {
    note(
      p,
      ctx,
      'Escolha uma posição próxima no Pavilhão Cultural, nos Jardins Centrais ou nos Jardins da Torre.',
    );
    return false;
  }
  if (
    !text ||
    all.length >= 30 ||
    all.some((other) => Math.hypot(x - other.x, z - other.z) < 9.5)
  ) {
    note(p, ctx, 'Informe um tema e afaste a mesa das outras mesas.');
    return false;
  }
  clearParticipant(p, ctx);
  const s = {
    id: randomUUID(),
    x,
    z,
    yaw,
    topic: text,
    style: {
      font: bounded(msg.font, 80, 170, 125),
      posterScale: bounded(msg.posterScale, 0.85, 1.25, 1),
    },
    host: seat(p),
    guest: null,
    queue: [],
    duration: bounded(msg.duration, 30, 1800, 120),
    endsAt: null,
    remaining: bounded(msg.duration, 30, 1800, 120) * 1000,
    timerActive: false,
  };
  sessions(ctx).set(s.id, s);
  seatPlayer(p, s, 0, ctx);
  note(
    p,
    ctx,
    'Mesa aberta. Use o chat para conversar; o microfone está disponível nos palanques e no palco da carreta.',
  );

  return true;
}

export function requestSeat(p, s, ctx) {
  if (expelled(p, s, ctx))
    note(p, ctx, 'Você foi expulso desta mesa e não pode voltar enquanto ela existir.');
  else if (distance(p, s) > 9) note(p, ctx, 'Chegue a até 9 metros da mesa para entrar na fila.');
  else if (mine(p, ctx)) note(p, ctx, 'Saia da cadeira atual para participar de outra mesa.');
  else if (s.queue.some((q) => q.id === p.id)) return false;
  else if (s.queue.length >= 30) note(p, ctx, 'A fila desta mesa está cheia.');
  else {
    for (const other of sessions(ctx).values())
      other.queue = other.queue.filter((q) => q.id !== p.id);
    s.queue.push(seat(p));
  }

  return true;
}

export function leaveDebate(p, s, ctx) {
  const host = s.host.id === p.id;
  if (host) {
    closeSession(s, ctx);
  } else {
    if (s.guest?.id === p.id) s.guest = null;
    s.queue = s.queue.filter((q) => q.id !== p.id);
  }
}

function hostEnd(p, msg, s, ctx) {
  closeSession(s, ctx);
}

function hostTopic(_p, msg, s) {
  if (topic(msg.topic)) s.topic = topic(msg.topic);
  s.style = {
    font: bounded(msg.font, 80, 170, s.style.font),
    posterScale: bounded(msg.posterScale, 0.85, 1.25, s.style.posterScale),
  };
}

function hostAccept(p, msg, s, ctx) {
  const q = ctx.players?.get(Number(msg.target));
  if (s.guest) note(p, ctx, 'A cadeira de convidado já está ocupada.');
  else if (
    q &&
    !expelled(q, s, ctx) &&
    s.queue.some((entry) => entry.id === q.id) &&
    distance(q, s) <= 9 &&
    !mine(q, ctx) &&
    !q.spectator &&
    !q.secretRide &&
    !q.race &&
    !q.raceFrozen
  ) {
    s.queue = s.queue.filter((entry) => entry.id !== q.id);
    s.guest = seat(q);
    seatPlayer(q, s, 1, ctx);
  } else note(p, ctx, 'O participante precisa continuar próximo da mesa e na fila.');
}

function hostKick(p, msg, s, ctx) {
  if (s.guest?.id === Number(msg.target)) {
    const q = ctx.players?.get(s.guest.id) ?? s.guest;
    if (!expulsions(ctx).has(s.id)) expulsions(ctx).set(s.id, new Set());
    expulsions(ctx).get(s.id).add(participantKey(q));
    s.queue = s.queue.filter((entry) => entry.id !== s.guest.id);
    s.guest = null;
    note(q, ctx, 'Você foi expulso desta mesa até que ela seja encerrada.');
  }
}

function hostTimer(_p, msg, s) {
  s.duration = bounded(msg.seconds, 30, 1800, s.duration);
  s.remaining = s.duration * 1000;
  s.timerActive = true;
  s.endsAt = msg.start ? Date.now() + s.remaining : null;
}

function hostPause(_p, _msg, s) {
  if (s.endsAt) s.remaining = Math.max(0, s.endsAt - Date.now());
  s.endsAt = null;
}

function hostReject(_p, msg, s) {
  s.queue = s.queue.filter((q) => q.id !== Number(msg.target));
}
function hostResume(p, _msg, s, ctx) {
  if (s.timerActive && !s.endsAt && s.remaining > 0) s.endsAt = Date.now() + s.remaining;
  else note(p, ctx, 'Ação de debate local desconhecida.');
}
const hostActions = {
  end: hostEnd,
  topic: hostTopic,
  accept: hostAccept,
  kick: hostKick,
  timer: hostTimer,
  pause: hostPause,
  reject: hostReject,
  resume: hostResume,
};
export function manageHost(action, p, msg, s, ctx) {
  const handler = Object.hasOwn(hostActions, action) ? hostActions[action] : null;
  if (handler) handler(p, msg, s, ctx);
  else note(p, ctx, 'Ação de debate local desconhecida.');
}

export function globalAction(action, p, msg, s, ctx) {
  if (action === 'state') {
    for (const m of snapshots(p, ctx)) send(p, ctx, m);
    return 'skip';
  }
  if (action === 'browse') {
    p.debateBrowsing = !!msg.on;
    sendSnapshots(p, ctx);
    return 'skip';
  }
  if (action === 'watch' && s) {
    p.debateRemote = s.id;
    p.debateListeningOff = false;
    return 'changed';
  }
  if (action === 'proximity') {
    p.debateRemote = null;
    p.debateListeningOff = false;
    return 'changed';
  }
  if (['unwatch', 'off', 'stop'].includes(action)) {
    p.debateRemote = null;
    p.debateListeningOff = true;
    return 'changed';
  }
  if (['voice', 'mute', 'level'].includes(action)) {
    note(p, ctx, 'O microfone está disponível somente nos palanques e no palco da carreta.');
    return 'skip';
  }
  return null;
}
