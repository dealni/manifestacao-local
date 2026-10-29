import { LARGE_ROOM_THRESHOLD } from './interest.js';
import { rememberReportableChat } from './reports.js';
import { getSession, resolveAccountTicket } from './auth.js';
import * as world from './world-actions.js';
import { leaveStageDeck } from './stage-voice.js';
import * as race from './race.js';
import * as social from './social.js';
import { getScreens, getSuperchats } from './media.js';
import * as debate from './debate.js';

import { prepareJoinedPlayer } from './realtime-join-player.js';
export function joinPlayer(r, c, msg) {
  const { ws, req } = c;

  if (
    r.ctx.config?.production &&
    !r.joinLimiter.check(req, {
      bucket: 'ws-join',
      limit: r.joinsPerMinute,
      windowMs: 60000,
    }).allowed
  ) {
    r.counters.rateLimited++;
    r.disconnect(ws, 1008, 'Muitas entradas. Aguarde um minuto.');
    return;
  }
  clearTimeout(c.timeout);
  const principal = getSession(req, r.ctx.state) || resolveAccountTicket(msg.ticket, r.ctx.state);
  const saved = typeof msg.token === 'string' ? r.sessions.get(msg.token) : null;
  const previous = saved && (!saved.userId || saved.userId === principal?.user.id) ? saved : null;
  // Reconectar a própria sessão substitui uma vaga; qualquer nova sessão
  // (inclusive espectador) consome a capacidade anunciada ao cliente.
  if (r.players.size >= r.capacity && !r.players.has(previous?.id)) {
    r.counters.rejectedJoins++;
    r.send(ws, {
      t: 'notice',
      text: 'Sala cheia. Tente novamente em instantes.',
    });
    r.disconnect(ws, 1013, 'Sala cheia');
    return;
  }
  // O close da conexão substituída ignora este jogador depois da troca no Map.
  // Libere agora as atividades que guardam a instância antiga da sessão.
  if (previous && r.players.get(previous.id) === previous) {
    leaveStageDeck(previous, r.ctx);
    world.onPlayerLeave?.(previous, r.ctx);
    social.cleanupSocial?.(previous, r.ctx);
    debate.cleanupDebate(previous, r.ctx);
  }
  const { id, token } = prepareJoinedPlayer(r, c, msg, principal, previous);
  r.presence.join(c.player);
  r.players.set(id, c.player);
  r.sessions.set(token, c.player);
  ws.player = c.player;
  welcomePlayer(r, c, id, token);
}
function welcomePlayer(r, c, id, token) {
  const extra = {
    ...(world.initWorld?.(c.player, r.ctx) || {}),
    race: race.initRace?.(c.player, r.ctx),
  };
  for (const chat of r.history) rememberReportableChat(c.player, chat);
  r.sendPlayer(c.player, {
    t: 'welcome',
    id,
    token,
    boot: r.boot,
    capacity: r.capacity,
    serverTime: Date.now(),
    inputBinary: true,
    trustEpoch: c.player.trustEpoch ?? 0,
    role: 'player',
    history: r.history,
    vehicles: r.vehicles(),
    sounds: [],
    screens: getScreens(r.ctx),
    palanque: { live: [], occupied: [] },
    physical: {},
    superchats: getSuperchats(r.ctx),
    ...extra,
  });
  r.names(c.player, true);
  if (r.players.size <= LARGE_ROOM_THRESHOLD) r.broadcast(r.stats());
  r.snapshot(c.player);
  const hello = social.initSocial?.(c.player, r.ctx);
  if (hello) r.sendPlayer(c.player, hello);
  for (const message of debate.initDebate(c.player, r.ctx)) r.sendPlayer(c.player, message);
  r.sendPlayer(c.player, { t: 'mode', spectator: c.player.spectator });
  return;
}
