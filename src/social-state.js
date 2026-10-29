// Cotas de armazenamento, sem expiração nem exclusão automática do histórico.
export const SOCIAL_MESSAGE_LIMITS = Object.freeze({
  conversation: 2_000,
  sender: 5_000,
  total: 50_000,
});

// Conta, relações e mensagens pertencem apenas a esta instalação local.
const identity = (p) => String(p?.userId ?? p?.uid ?? p?.user?.id ?? p?.account?.id ?? '');
const users = (ctx) => ctx.state.users ?? [];
const user = (ctx, id) => users(ctx).find((u) => String(u.id) === String(id));
const store = (ctx) =>
  (ctx.state.social ??= {
    friends: [],
    requests: [],
    blocks: [],
    messages: [],
    reports: [],
  });
const rooms = (ctx) => (ctx.socialRooms ??= new Map());
const players = (ctx) => [...(ctx.players?.values() ?? [])];
const send = (p, ctx, data) => ctx.sendPlayer(p, { t: 'social', ...data });
const notify = (id, ctx, data) =>
  players(ctx)
    .filter((p) => identity(p) === id)
    .forEach((p) => send(p, ctx, data));
const pair = (row, a, b) => (row[0] === a && row[1] === b) || (row[0] === b && row[1] === a);
const linked = (ctx, a, b) => store(ctx).friends.some((r) => pair(r, a, b));
const blocked = (ctx, a, b) => store(ctx).blocks.some((r) => pair(r, a, b));
const unreadCount = (ctx, id) => {
  const hidden = new Set(
    store(ctx)
      .blocks.filter((r) => r.includes(id))
      .map((r) => r.find((uid) => uid !== id)),
  );
  return store(ctx).messages.filter((m) => m.to === id && !m.read && !hidden.has(m.from)).length;
};
const canFocusThread = (ctx, id, target) =>
  !!user(ctx, target) &&
  !blocked(ctx, id, target) &&
  (linked(ctx, id, target) || store(ctx).messages.some((m) => pair([m.from, m.to], id, target)));
function person(ctx, id) {
  const u = user(ctx, id),
    p = players(ctx).find((p) => identity(p) === id);
  return {
    uid: id,
    id: p?.id ?? 0,
    nick: p?.nick ?? u?.nick ?? 'Jogador local',
    online: !!p,
    server: p ? 'Local' : '',
    team: p?.team ?? u?.team ?? '',
  };
}
function relation(ctx, a, b) {
  if (!b) return 'visitor';
  if (a === b) return 'self';
  const s = store(ctx);
  if (s.blocks.some((r) => r[0] === a && r[1] === b)) return 'blocked';
  if (blocked(ctx, a, b)) return 'hidden';
  if (linked(ctx, a, b)) return 'friend';
  if (s.requests.some((r) => r[0] === b && r[1] === a)) return 'in';
  if (s.requests.some((r) => r[0] === a && r[1] === b)) return 'out';
  return 'none';
}
function lists(p, ctx) {
  const id = identity(p),
    s = store(ctx);
  send(p, ctx, {
    a: 'friends',
    people: s.friends
      .filter((r) => r.includes(id))
      .map((r) =>
        person(
          ctx,
          r.find((x) => x !== id),
        ),
      ),
    next: null,
  });
  send(p, ctx, {
    a: 'requests',
    people: s.requests.filter((r) => r[1] === id).map((r) => person(ctx, r[0])),
    outgoing: s.requests.filter((r) => r[0] === id).map((r) => person(ctx, r[1])),
  });
}
export function initSocial(p, ctx) {
  const id = identity(p),
    s = store(ctx);
  return {
    t: 'social',
    a: 'hello',
    account: !!user(ctx, id),
    uid: id,
    pendingIn: s.requests.filter((r) => r[1] === id).length,
    unread: unreadCount(ctx, id),
  };
}
const notice = (p, ctx, text) => send(p, ctx, { a: 'notice', text });
function updateRoom(room, ctx) {
  const members = [...room.members].map((uid) => ({
    ...person(ctx, uid),
    owner: uid === room.owner,
    muted: true,
  }));
  for (const id of room.members)
    notify(id, ctx, {
      a: 'voice',
      room: room.id,
      max: 20,
      mine: room.owner === id,
      publish: false,
      members,
    });
}
function leaveRoom(id, ctx) {
  for (const room of rooms(ctx).values())
    if (room.members.delete(id)) {
      notify(id, ctx, { a: 'voice_end' });
      if (!room.members.size) rooms(ctx).delete(room.id);
      else {
        if (room.owner === id) room.owner = [...room.members][0];
        updateRoom(room, ctx);
      }
    }
}
export function cleanupSocial(p, ctx) {
  delete p.socialThread;
  const id = identity(p);
  if (!players(ctx).some((other) => other !== p && identity(other) === id)) leaveRoom(id, ctx);
}

export {
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
};
