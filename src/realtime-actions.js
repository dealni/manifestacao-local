import { isPresenceAction } from './presence.js';
import { handleVehicleSeat } from './vehicle-seats.js';

import { actionNick, actionStyle, actionAccount } from './realtime-actions-profile.js';
import {
  actionSpectate,
  actionEmote,
  actionVehicle,
  actionUnstuck,
  actionHorn,
} from './realtime-actions-movement.js';
import {
  actionChat,
  actionVoice,
  actionChatReport,
  actionPerformance,
  actionFallback,
} from './realtime-actions-chat.js';
const handlers = {
  nick: actionNick,
  style: actionStyle,
  spectate: actionSpectate,
  emote: actionEmote,
  vehicle: actionVehicle,
  unstuck: actionUnstuck,
  horn: actionHorn,
  chat: actionChat,
  voice: actionVoice,
  rtc: actionVoice,
  account: actionAccount,
  chat_report: actionChatReport,
  report: actionChatReport,
  performance: actionPerformance,
  client_error: actionPerformance,
  view: actionPerformance,
};
export function dispatchPlayerMessage(r, c, msg) {
  const { ws } = c;
  const p = c.player;
  if (msg.t !== 'input' && !r.allow(ws, 'actions', r.actionLimit)) {
    r.counters.rateLimited++;
    return;
  }
  if (msg.t === 'chat' && !r.allow(ws, 'chat', r.chatLimit, 10000)) {
    r.counters.rateLimited++;
    r.send(ws, {
      t: 'notice',
      text: 'Aguarde alguns segundos antes de enviar outra mensagem.',
    });
    return;
  }
  if (
    p.secretRide &&
    ['spectate', 'vehicle', 'unstuck', 'palanque_ir', 'palanque_enter', 'race', 'cm'].includes(
      msg.t,
    )
  ) {
    r.sendPlayer(p, {
      t: 'notice',
      text: 'Aguarde o elevador voltar ao térreo ou saia dele antes desta ação.',
    });
    return;
  }
  if (isPresenceAction(msg)) r.presence.active(p);
  if (msg.t === 'active') return;

  if (msg.t === 'input') return r.input(p, msg);
  if (handleVehicleSeat(p, msg, r.ctx)) {
    r.broadcast(r.stats());
    r.snapshot(p);
    return;
  }
  const handler = Object.hasOwn(handlers, msg.t) ? handlers[msg.t] : actionFallback;
  handler(r, p, msg);
}
