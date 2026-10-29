import { sessions, mine, distance, note, updateDebate } from './debate-state.js';
import {
  createDebate,
  globalAction,
  requestSeat,
  leaveDebate,
  manageHost,
} from './debate-actions.js';
export { initDebate, updateDebate, cleanupDebate } from './debate-state.js';

export function handleDebateMessage(p, msg, ctx) {
  if (msg.t !== 'cm') return false;
  const action = String(msg.action ?? ''),
    all = [...sessions(ctx).values()],
    requestedSession = msg.session == null ? null : String(msg.session);
  const s =
    requestedSession !== null
      ? sessions(ctx).get(requestedSession)
      : (mine(p, ctx) ??
        all.filter((s) => distance(p, s) <= 9).sort((a, b) => distance(p, a) - distance(p, b))[0]);
  const host = s?.host.id === p.id;
  if (action === 'create') {
    if (!createDebate(p, msg, ctx, all)) return true;
  } else {
    const outcome = globalAction(action, p, msg, s, ctx);
    if (outcome === 'skip') return true;
    if (outcome !== 'changed') {
      if (!s) note(p, ctx, 'Esta mesa não está mais disponível.');
      else if (action === 'request') {
        if (!requestSeat(p, s, ctx)) return true;
      } else if (action === 'leave') leaveDebate(p, s, ctx);
      else if (!host) note(p, ctx, 'Somente o anfitrião pode gerenciar esta mesa.');
      else manageHost(action, p, msg, s, ctx);
    }
  }
  updateDebate(ctx);
  return true;
}
