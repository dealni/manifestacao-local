import { randomUUID } from 'node:crypto';
import { handleChatReport, rememberReportableChat } from './reports.js';
import * as world from './world-actions.js';
import * as race from './race.js';
import * as social from './social.js';
import { handleRoadsterMessage } from './roadster.js';
import * as debate from './debate.js';

export function actionChat(r, p, msg) {
  const text = String(msg.text || '')
    // eslint-disable-next-line no-control-regex -- Remove ou rejeita controles ASCII recebidos do usuário.
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, 280);
  if (!text) return;
  const chat = {
    t: 'chat',
    id: p.id,
    nick: p.nick,
    text,
    channel: msg.channel === 'local' ? 'local' : 'global',
    x: p.x,
    z: p.z,
    at: Date.now(),
    mid: randomUUID(),
  };
  // Mensagens de proximidade só existem na entrega ao vivo autorizada.
  if (chat.channel === 'global') {
    r.history.push(chat);
    if (r.history.length > 80) r.history.shift();
  }
  for (const target of r.players.values())
    if (chat.channel !== 'local' || Math.hypot(target.x - p.x, target.z - p.z) < 70) {
      rememberReportableChat(target, chat);
      r.sendPlayer(target, chat);
    }
}
export function actionVoice(r, p, _msg) {
  r.sendPlayer(p, {
    t: 'notice',
    text: 'Voz não está disponível nesta reconstrução local.',
  });
}
export function actionChatReport(r, p, msg) {
  handleChatReport(r.ctx, p, msg);
}
export function actionPerformance(_r, _p, _msg) {
  /* telemetria fica somente local */
}
export function actionFallback(r, p, msg) {
  if (
    !handleRoadsterMessage(p, msg, r.ctx) &&
    !debate.handleDebateMessage(p, msg, r.ctx) &&
    !race.handleRaceMessage?.(p, msg, r.ctx) &&
    !social.handleSocialMessage?.(p, msg, r.ctx)
  )
    world.handleWorldMessage?.(p, msg, r.ctx);
}
