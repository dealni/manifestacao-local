import { WebSocket } from 'ws';
import { decodeInput } from './protocol.js';
import { handleStageVoicePacket } from './stage-voice.js';

import { joinPlayer } from './realtime-join.js';
import { dispatchPlayerMessage } from './realtime-actions.js';
export function receiveMessage(r, c, data, binary) {
  const { ws } = c;

  try {
    if (!admitMessage(r, c)) return;
    if (binary) {
      receiveBinary(r, c, data);
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'ping') {
      r.send(ws, { t: 'pong', at: msg.at, now: Date.now() });
      return;
    }
    if (msg.t === 'lobby') {
      // A inscrição é única; atualizações seguintes já chegam no broadcast.
      // Repetições não devem recalcular a lista completa de veículos da sala.
      if (ws.lobby) return;
      ws.lobby = true;
      clearTimeout(c.timeout);
      r.send(ws, r.stats());
      return;
    }
    if (msg.t === 'join' && !c.player) {
      joinPlayer(r, c, msg);
      return;
    }
    if (!c.player) return;
    dispatchPlayerMessage(r, c, msg);
  } catch (error) {
    if (!r.storageAvailable()) {
      r.stopForStorage();
      return;
    }
    r.ctx.log?.('realtime', error);
    r.send(ws, {
      t: 'error',
      message: 'Não foi possível executar esta ação local.',
    });
  }
}

function admitMessage(r, c) {
  const { ws } = c;
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (!r.storageAvailable() || r.storageStopped) {
    r.stopForStorage();
    return false;
  }
  if (!r.allow(ws, 'messages', r.messageLimit)) {
    r.counters.rateLimited++;
    r.disconnect(ws, 1008, 'Limite de mensagens excedido.');
    return false;
  }
  // Um socket substituído não pode mais despachar, mesmo durante o close handshake.
  if (c.player && (r.players.get(c.player.id) !== c.player || ws.readyState !== WebSocket.OPEN))
    return false;
  if (c.player) r.ensureIdentity(c.player);

  return true;
}
function receiveBinary(r, c, data) {
  if (c.player) {
    if (handleStageVoicePacket(c.player, data, r.ctx)) return;
    const decoded = decodeInput(data);
    if (decoded) r.input(c.player, decoded);
  }
  return;
}
