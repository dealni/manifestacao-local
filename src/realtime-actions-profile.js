import { resolveAccountTicket } from './auth.js';
import * as social from './social.js';

import { cleanNick } from './realtime-values.js';
export function actionNick(r, p, msg) {
  // As mesmas restrições do perfil HTTP também valem para o transporte realtime.
  // A primeira escolha deve passar pelo perfil, que finaliza os pontos e convites.
  const nick = String(msg.nick ?? '')
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex -- Remove ou rejeita controles ASCII recebidos do usuário.
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (nick.length < 2 || nick.length > 12 || /\S+@\S+\.\S+|\d[\d\s()+-]{7,}\d/.test(nick)) {
    r.sendPlayer(p, {
      t: 'notice',
      text: 'Use um apelido de 2 a 12 caracteres, sem e-mail ou telefone.',
    });
    return;
  }
  if (p.user?.nickPending) {
    r.sendPlayer(p, {
      t: 'notice',
      text: 'Finalize seu apelido no perfil da conta.',
    });
    return;
  }
  p.nick = nick;
  if (p.user) {
    p.user.nick = p.nick;
    r.ctx.save?.();
  }
  r.sendPlayer(p, { t: 'nick', nick: p.nick });
  r.names(p);
}
export function actionStyle(r, p, msg) {
  r.applyStyle(p, msg);
  r.names(p);
}
export function actionAccount(r, p, msg) {
  const principal = resolveAccountTicket(msg.ticket, r.ctx.state);
  if (principal) {
    if (p.userId !== principal.user.id || p.authSessionToken !== principal.token)
      r.clearIdentity(p);
    p.user = principal.user;
    p.userId = principal.user.id;
    p.authSessionToken = principal.token;
    p.nick = cleanNick(principal.user.nick);
    const hello = social.initSocial?.(p, r.ctx);
    if (hello) r.sendPlayer(p, hello);
    r.names(p);
  } else if (msg.ticket === null || msg.ticket === undefined) r.clearIdentity(p);
  else
    r.sendPlayer(p, {
      t: 'notice',
      text: 'Sessão local inválida. Entre novamente na sua conta.',
    });
}
