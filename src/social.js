import { randomUUID } from 'node:crypto';

import {
  SOCIAL_MESSAGE_LIMITS,
  identity,
  users,
  user,
  store,
  rooms,
  players,
  send,
  notify,
  pair,
  linked,
  blocked,
  unreadCount,
  canFocusThread,
  person,
  relation,
  lists,
  notice,
  updateRoom,
  leaveRoom,
  initSocial,
} from './social-state.js';
export { SOCIAL_MESSAGE_LIMITS, initSocial, cleanupSocial } from './social-state.js';

export function handleSocialMessage(p, msg, ctx) {
  if (msg.t !== 'social') return false;
  const id = identity(p),
    s = store(ctx),
    a = String(msg.a ?? '');
  if (!user(ctx, id)) {
    send(p, ctx, {
      a: 'guest',
      text: 'Crie uma conta local para usar amizades e mensagens.',
    });
    return true;
  }
  const target = typeof msg.uid === 'string' ? msg.uid : '';
  const refresh = (other) => {
    for (const x of players(ctx))
      if ([id, other].includes(identity(x))) {
        ctx.sendPlayer(x, initSocial(x, ctx));
        lists(x, ctx);
      }
  };
  const handler = Object.hasOwn(socialActions, a)
    ? socialActions[a]
    : a.startsWith('voice_')
      ? handleSocialVoice
      : unknownSocial;
  handler({ p, msg, ctx, id, s, a, target, refresh });
  return true;
}

const socialActions = {
  friends: socialFriendsRequests,
  requests: socialFriendsRequests,
  blocked: socialBlocked,
  find: socialFind,
  who: socialWho,
  request: changeRelationship,
  accept: changeRelationship,
  decline: changeRelationship,
  cancel: changeRelationship,
  remove: changeRelationship,
  block: changeRelationship,
  unblock: changeRelationship,
  dm: socialDm,
  thread_focus: socialThreadFocus,
  read: socialRead,
  thread: socialThread,
  inbox: socialInbox,
  report: socialReport,
};

function socialFriendsRequests({ p, ctx }) {
  lists(p, ctx);
}

function socialBlocked({ p, ctx, id, s, a }) {
  send(p, ctx, {
    a,
    people: s.blocks.filter((r) => r[0] === id).map((r) => person(ctx, r[1])),
  });
}

function socialFind({ p, msg, ctx, id }) {
  const q = String(msg.nick ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .slice(0, 100);
  send(p, ctx, {
    a: 'found',
    people: q
      ? users(ctx)
          .filter(
            (u) =>
              String(u.id) !== id &&
              String(u.nick).toLocaleLowerCase('pt-BR').includes(q) &&
              !blocked(ctx, id, String(u.id)),
          )
          .slice(0, 50)
          .map((u) => person(ctx, String(u.id)))
      : [],
  });
}

function socialWho({ p, msg, ctx, id, a }) {
  const who = ctx.players?.get(Number(msg.id));
  if (who)
    send(p, ctx, {
      a,
      ...person(ctx, identity(who)),
      id: who.id,
      nick: who.nick,
      rel: relation(ctx, id, identity(who)),
    });
}

function blockRelationship(ctx, id, s, target) {
  if (!s.blocks.some((r) => r[0] === id && r[1] === target)) s.blocks.push([id, target]);
  s.friends = s.friends.filter((r) => !pair(r, id, target));
  s.requests = s.requests.filter((r) => !pair(r, id, target));
  // Revoga convites anteriores, inclusive após um desbloqueio posterior.
  for (const room of rooms(ctx).values()) {
    if (room.members.has(id)) room.invited.delete(target);
    if (room.members.has(target)) room.invited.delete(id);
  }
  // Bloquear também separa participantes que já estavam em uma sala.
  for (const room of rooms(ctx).values())
    if (room.members.has(id) && room.members.has(target)) leaveRoom(id, ctx);
}

function clearRelationshipThreads(ctx, id, target) {
  for (const other of players(ctx))
    if (
      (identity(other) === id && other.socialThread === target) ||
      (identity(other) === target && other.socialThread === id)
    )
      delete other.socialThread;
}

function mayRequestFriend(ctx, id, target, s) {
  return (
    !blocked(ctx, id, target) &&
    !linked(ctx, id, target) &&
    !s.requests.some((r) => pair(r, id, target))
  );
}
function mayAcceptFriend(ctx, id, target, s) {
  return !blocked(ctx, id, target) && s.requests.some((r) => r[0] === target && r[1] === id);
}
function changeRelationship({ p, ctx, id, s, a, target, refresh }) {
  if (!user(ctx, target) || target === id) return true;
  if (a === 'request' && mayRequestFriend(ctx, id, target, s)) {
    s.requests.push([id, target]);
    notify(target, ctx, { a: 'request_in', uid: id, nick: p.nick });
  } else if (a === 'accept' && mayAcceptFriend(ctx, id, target, s)) {
    s.requests = s.requests.filter((r) => !pair(r, id, target));
    if (!linked(ctx, id, target)) s.friends.push([id, target]);
  } else if (a === 'decline')
    s.requests = s.requests.filter((r) => !(r[0] === target && r[1] === id));
  else if (a === 'cancel') s.requests = s.requests.filter((r) => !(r[0] === id && r[1] === target));
  else if (a === 'remove') s.friends = s.friends.filter((r) => !pair(r, id, target));
  else if (a === 'block') {
    blockRelationship(ctx, id, s, target);
  } else if (a === 'unblock') s.blocks = s.blocks.filter((r) => !(r[0] === id && r[1] === target));
  if (['block', 'remove'].includes(a)) clearRelationshipThreads(ctx, id, target);
  ctx.save();
  refresh(target);
  if (['block', 'unblock'].includes(a))
    send(p, ctx, {
      a: 'blocked',
      people: s.blocks.filter((r) => r[0] === id).map((r) => person(ctx, r[1])),
    });
}

function socialDm({ p, msg, ctx, id, s, target }) {
  const text = String(msg.text ?? '')
    // eslint-disable-next-line no-control-regex -- Remove ou rejeita controles ASCII recebidos do usuário.
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 180);
  if (!text || !linked(ctx, id, target) || blocked(ctx, id, target)) {
    notice(p, ctx, 'Mensagens privadas estão disponíveis entre amigos locais.');
    return true;
  }
  if (s.messages.length >= SOCIAL_MESSAGE_LIMITS.total) {
    notice(
      p,
      ctx,
      'O armazenamento de mensagens privadas do servidor atingiu o limite. Novos envios estão suspensos; o histórico continua disponível. Contate a administração.',
    );
    return true;
  }
  if (s.messages.filter((m) => m.from === id).length >= SOCIAL_MESSAGE_LIMITS.sender) {
    notice(
      p,
      ctx,
      'Sua conta atingiu o limite de mensagens privadas enviadas. O histórico continua disponível. Contate a administração.',
    );
    return true;
  }
  if (
    s.messages.filter((m) => pair([m.from, m.to], id, target)).length >=
    SOCIAL_MESSAGE_LIMITS.conversation
  ) {
    notice(
      p,
      ctx,
      'Esta conversa atingiu o limite de mensagens privadas. O histórico continua disponível. Contate a administração.',
    );
    return true;
  }
  const message = {
    id: randomUUID(),
    from: id,
    to: target,
    text,
    at: Date.now(),
    read: false,
  };
  s.messages.push(message);
  ctx.save();
  notify(id, ctx, {
    a: 'dm',
    ...message,
    uid: target,
    nick: person(ctx, target).nick,
  });
  notify(target, ctx, { a: 'dm', ...message, uid: id, nick: p.nick });
}

function socialThreadFocus({ p, msg, ctx, id, target }) {
  delete p.socialThread;
  if (msg.on === true && canFocusThread(ctx, id, target)) p.socialThread = target;
}

function socialRead({ p, msg, ctx, id, s, target }) {
  if (p.socialThread !== target || !canFocusThread(ctx, id, target)) return true;
  const last = s.messages.findIndex((m) => m.id === msg.mid && m.from === target && m.to === id);
  if (last < 0) return true;
  let changed = false;
  for (const m of s.messages.slice(0, last + 1))
    if (m.from === target && m.to === id && !m.read) {
      m.read = true;
      changed = true;
    }
  if (changed) ctx.save();
  notify(id, ctx, {
    a: 'read',
    uid: target,
    mid: msg.mid,
    unread: unreadCount(ctx, id),
  });
  for (const other of players(ctx))
    if (identity(other) === id) ctx.sendPlayer(other, initSocial(other, ctx));
}

function socialThread({ p, msg, ctx, id, s, a, target }) {
  if (!user(ctx, target) || blocked(ctx, id, target)) return true;
  const all = s.messages.filter((m) => pair([m.from, m.to], id, target));
  const cursor = msg.before ? all.findIndex((m) => m.id === msg.before) : all.length;
  // Cursores desconhecidos nunca podem transformar slice(0, -1) em uma página ilimitada.
  const end = Math.max(0, cursor);
  const start = Math.max(0, end - 100),
    messages = all.slice(start, end);
  send(p, ctx, {
    a,
    uid: target,
    nick: person(ctx, target).nick,
    messages,
    before: msg.before ?? null,
    next: start > 0 ? messages[0]?.id : null,
  });
}

function socialInbox({ p, ctx, id, s, a }) {
  // Agrega em uma passagem: o histórico pode conter 50 mil mensagens.
  const conversations = new Map();
  for (const message of s.messages) {
    if (message.from !== id && message.to !== id) continue;
    const uid = message.from === id ? message.to : message.from;
    const conversation = conversations.get(uid) ?? { unread: 0 };
    conversation.preview = message.text;
    conversation.at = message.at;
    if (message.to === id && !message.read) conversation.unread++;
    conversations.set(uid, conversation);
  }
  const threads = [...conversations]
    .filter(([uid]) => !blocked(ctx, id, uid))
    .map(([uid, conversation]) => ({ ...person(ctx, uid), ...conversation }))
    .sort((a, b) => b.at - a.at);
  send(p, ctx, { a, threads, next: null });
}

function socialReport({ p, msg, ctx, id, s }) {
  const m = s.messages.find((m) => m.id === msg.mid && m.to === id);
  if (!m) {
    notice(p, ctx, 'Esta mensagem não está disponível para denúncia.');
    return true;
  }
  if (!s.reports.some((r) => r.mid === m.id && r.by === id)) {
    s.reports.push({ mid: m.id, by: id, at: Date.now(), local: true });
    ctx.save();
  }
  notice(
    p,
    ctx,
    'Registro salvo apenas nesta instalação local. Não é enviado a uma equipe externa.',
  );
}

function joinSocialVoice(p, msg, ctx, id) {
  const desired = rooms(ctx).get(String(msg.room));
  if (desired?.members.has(id)) {
    updateRoom(desired, ctx);
    return true;
  }
  if (
    desired &&
    desired.invited.has(id) &&
    desired.members.size < 20 &&
    ![...desired.members].some((uid) => blocked(ctx, id, uid))
  ) {
    leaveRoom(id, ctx);
    desired.invited.delete(id);
    desired.members.add(id);
    updateRoom(desired, ctx);
  } else notice(p, ctx, 'Convite inválido ou sala indisponível.');
}

function openSocialVoice(p, ctx, id, room) {
  if (!room) {
    room = {
      id: randomUUID(),
      owner: id,
      members: new Set([id]),
      invited: new Set(),
    };
    rooms(ctx).set(room.id, room);
  }
  updateRoom(room, ctx);
  notice(
    p,
    ctx,
    'Grupo criado. O microfone está disponível somente nos palanques e no palco da carreta.',
  );
}

function handleSocialVoice({ p, msg, ctx, id, a, target }) {
  const room = [...rooms(ctx).values()].find((r) => r.members.has(id));
  if (a === 'voice_open') {
    openSocialVoice(p, ctx, id, room);
  } else if (a === 'voice_leave') leaveRoom(id, ctx);
  else if (a === 'voice_invite' && room && linked(ctx, id, target) && !blocked(ctx, id, target)) {
    room.invited.add(target);
    notify(target, ctx, { a, room: room.id, nick: p.nick });
  } else if (a === 'voice_join') {
    joinSocialVoice(p, msg, ctx, id);
  } else if (a === 'voice_decline') rooms(ctx).get(String(msg.room))?.invited.delete(id);
  else if (['voice_token', 'voice_mute'].includes(a))
    notice(p, ctx, 'O microfone está disponível somente nos palanques e no palco da carreta.');
  else if (room && room.owner === id && a === 'voice_kick') {
    const member = players(ctx).find((other) => other.id === Number(msg.id)),
      uid = identity(member);
    if (uid !== id && room.members.has(uid)) {
      room.members.delete(uid);
      notify(uid, ctx, { a: 'voice_end', text: 'Você saiu do grupo.' });
      updateRoom(room, ctx);
    }
  }
}

function unknownSocial({ p, ctx }) {
  notice(p, ctx, 'Ação social local desconhecida.');
}
