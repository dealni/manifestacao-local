import { LARGE_ROOM_THRESHOLD } from './interest.js';
import { releaseVehicleSeats } from './vehicle-seats.js';
import { WebSocket } from 'ws';
import * as world from './world-actions.js';
import { leaveStageDeck } from './stage-voice.js';
import * as social from './social.js';
import * as debate from './debate.js';
import { clientIp } from './runtime-config.js';

import { receiveMessage } from './realtime-message.js';
export function connect(r, ws, req) {
  const c = { player: undefined, timeout: undefined, ws, req };
  ws.on('error', () => {});
  ws.on('close', () => clearTimeout(ws.disconnectTimer));
  ws.peerIp = clientIp(req, r.ctx.config ?? {});
  ws.rateBuckets = Object.create(null);
  ws.alive = true;
  ws.on('pong', () => {
    ws.alive = true;
  });
  const ipConnections = r.ctx.config?.production
    ? [...r.wss.clients].filter(
        (peer) => peer.peerIp === ws.peerIp && peer.readyState === WebSocket.OPEN,
      ).length
    : 0;
  if (!r.storageAvailable() || r.storageStopped) {
    r.disconnect(ws, 1013, 'Armazenamento indisponível. Tente novamente.');
    return;
  }
  if (r.wss.clients.size > r.maxConnections || ipConnections > r.perIpConnections) {
    r.counters.rejectedJoins++;
    r.disconnect(ws, 1013, 'Servidor ocupado. Tente novamente.');
    return;
  }
  c.timeout = setTimeout(() => {
    if (!c.player && !ws.lobby) ws.close(1008, 'Envie join ou lobby');
  }, 15000);
  c.timeout.unref();
  ws.on('message', (data, binary) => receiveMessage(r, c, data, binary));
  ws.on('close', () => {
    clearTimeout(c.timeout);
    clearTimeout(ws.disconnectTimer);
    if (c.player && r.players.get(c.player.id) === c.player) {
      leaveStageDeck(c.player, r.ctx);
      releaseVehicleSeats(c.player, r.ctx);
      r.players.delete(c.player.id);
      c.player.disconnectedAt = Date.now();
      c.player.speed = 0;
      if (!r.storageAvailable() || r.storageStopped || r.closed) return;
      world.onPlayerLeave?.(c.player, r.ctx);
      social.cleanupSocial?.(c.player, r.ctx);
      debate.cleanupDebate(c.player, r.ctx);
      r.pendingNames.delete(c.player.id);
      if (r.players.size <= LARGE_ROOM_THRESHOLD) r.broadcast(r.stats());
    }
  });
}
