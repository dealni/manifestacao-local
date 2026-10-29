import { HEARTBEAT_INTERVAL } from './presence.js';
import { createInterestIndex, LARGE_ROOM_THRESHOLD } from './interest.js';
import { tickVehicleSeats } from './vehicle-seats.js';
import { WebSocket } from 'ws';
import { encodeOverview } from './protocol.js';
import * as world from './world-actions.js';
import { refreshStageVoice, tickStageDecks } from './stage-voice.js';
import * as race from './race.js';
import { roadsterVehicle } from './roadster.js';
import * as debate from './debate.js';

export function publishTick(r, now, dt) {
  tickVehicleSeats(r.ctx);
  tickStageDecks(r.ctx, dt);
  refreshStageVoice(r.ctx, now);
  // Avalia impactos depois de integrar todas as poses deste tick.
  for (const p of r.players.values()) world.worldVehicleTick?.(p, r.ctx);
  publishSnapshots(r, now);
  race.tickRace?.(r.ctx, now);
  if (r.ticks % 2 === 0) {
    const items = [...r.players.values()]
      .filter((p) => p.mode === 12 && p.vehicle)
      .map(roadsterVehicle);
    if (items.length) r.broadcast({ t: 'roadsters', at: now, items });
  }
  heartbeat(r, now);
  if (r.ticks % 20 === 0) {
    debate.updateDebate(r.ctx);
    r.broadcast(r.stats());
    for (const [token, p] of r.sessions)
      if (p.disconnectedAt && now - p.disconnectedAt > 600000) r.sessions.delete(token);
  }
}
export function publishSnapshots(r, now) {
  const large = r.players.size > LARGE_ROOM_THRESHOLD;
  const index = large ? createInterestIndex(r.players.values()) : null;
  for (const p of r.players.values())
    if (!large || p.id % 2 === r.ticks % 2) r.snapshot(p, now, index);
  const overviewGroups = r.players.size >= 512 ? 20 : 10;
  if (large || r.ticks % 10 === 0) {
    const overview = encodeOverview(
      [...r.players.values()].filter((actor) => !actor.spectator),
      now >>> 0,
    );
    for (const p of r.players.values())
      if (!large || p.id % overviewGroups === r.ticks % overviewGroups) {
        r.sendPlayer(p, overview);
        r.counters.overviewPackets++;
      }
  }
  if (r.ticks % 10 === 0 && r.pendingNames.size) {
    const changed = [...r.pendingNames.values()].filter((p) => r.players.get(p.id) === p);
    r.pendingNames.clear();
    if (changed.length) r.identityPacket(changed);
  }
}
export function heartbeat(r, now) {
  if (now - r.lastHeartbeat >= HEARTBEAT_INTERVAL) {
    r.lastHeartbeat = now;
    for (const ws of r.wss.clients) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }
  }
}
