import { releaseVehicleSeats } from './vehicle-seats.js';
import { sessionForToken } from './auth.js';
import * as race from './race.js';
import * as social from './social.js';
import * as debate from './debate.js';

export function clearIdentity(r, p) {
  const old = { ...p };
  p.user = null;
  p.userId = undefined;
  p.authSessionToken = null;
  releaseVehicleSeats(p, r.ctx);
  delete p.worldPrevious;
  delete p.socialThread;
  p.design = null;
  r.sanitizeEquipment(p);
  race.handleRaceMessage?.(p, { t: 'race', action: 'leave' }, r.ctx);
  social.cleanupSocial?.(old, r.ctx);
  debate.cleanupDebate(p, r.ctx);
  r.send(p.ws, social.initSocial?.(p, r.ctx) ?? { t: 'social', a: 'guest' });
  queueMicrotask(() => {
    if (!r.closed) r.names(p);
  });
}

export function ensureIdentity(r, p) {
  if (!p?.userId) return true;
  const record = r.ctx.state.sessions?.[p.authSessionToken];
  const valid =
    record?.userId === p.userId &&
    Number.isFinite(record.expiresAt) &&
    record.expiresAt > Date.now();
  const indexedUser = r.ctx.state.users?.[p.identityIndex];
  let session =
    valid && r.tickUsers
      ? { user: r.tickUsers.get(p.userId) }
      : valid && indexedUser?.id === p.userId
        ? { user: indexedUser }
        : null;
  if (valid && !session && !r.tickUsers) {
    session = sessionForToken(p.authSessionToken, r.ctx.state);
    if (session) p.identityIndex = r.ctx.state.users.indexOf(session.user);
  }
  if (session?.user?.id === p.userId) {
    p.user = session.user;
    return true;
  }
  r.clearIdentity(p);
  return false;
}
