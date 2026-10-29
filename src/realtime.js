import { createPresence } from './presence.js';
import { MAX_NEAR_ACTORS } from './interest.js';
import { createVehicleIdAllocator } from './vehicle-ids.js';
import { releaseVehicleSeats } from './vehicle-seats.js';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { createRateLimiter } from './runtime-config.js';
import { createMovementValidator } from './movement.js';
import {
  nextVehicle,
  setting,
  allow,
  disconnect,
  storageAvailable,
  stopForStorage,
  send,
  sendPlayer,
  broadcast,
} from './realtime-transport.js';
import { clearIdentity, ensureIdentity } from './realtime-identity.js';
import { vehicles, stats, person, identityPacket, names, snapshot } from './realtime-roster.js';
import { relocate, sanitizeEquipment, applyStyle, seated, input } from './realtime-player.js';
import { connect } from './realtime-connection.js';
import { tick } from './realtime-tick.js';
/** Estado da sala compartilhado pelos módulos de transporte, jogadores e ticks. */
export function attachRealtime(server, ctx) {
  const r = { ctx };
  r.wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  r.players = new Map();
  r.sessions = new Map();
  r.history = [];
  r.movement = createMovementValidator();
  r.boot = randomUUID();
  r.nextId = 1;
  r.allocateVehicleId = createVehicleIdAllocator();
  r.nextVehicle = nextVehicle.bind(null, r);
  r.closed = false;
  r.lastTick = Date.now();
  r.ticks = 0;
  r.lastHeartbeat = Date.now();
  r.lastReportCleanup = 0;
  r.tickUsers = null;
  r.pendingNames = new Map();
  r.tickDurations = [];
  r.setting = setting.bind(null, r);
  r.capacity = r.setting('maxPlayers', 1000, 1000);
  r.maxConnections = r.setting('wsMaxConnections', r.capacity * 3 + 10);
  r.messageLimit = r.setting('wsMessagesPerSecond', 120);
  r.actionLimit = r.setting('wsActionsPerSecond', 20);
  r.chatLimit = r.setting('wsChatPer10Seconds', 8);
  r.joinsPerMinute = r.setting('wsJoinPerMinute', 30);
  r.perIpConnections = r.setting('maxConnectionsPerIp', 10);
  r.joinLimiter = createRateLimiter(r.ctx.config ?? {}, {
    maxEntries: 10000,
  });
  r.counters = {
    rejectedJoins: 0,
    rateLimited: 0,
    slowConsumers: 0,
    tickOverruns: 0,
    lastTickMs: 0,
    maxTickMs: 0,
    sentBytes: 0,
    nearPackets: 0,
    overviewPackets: 0,
    maxNearActors: 0,
  };
  r.allow = allow.bind(null, r);
  r.disconnect = disconnect.bind(null, r);
  r.storageStopped = false;
  r.storageAvailable = storageAvailable.bind(null, r);
  r.stopForStorage = stopForStorage.bind(null, r);
  r.ctx.players = r.players;
  r.ctx.releaseVehicleSeats = (p) => releaseVehicleSeats(p, r.ctx);
  r.send = send.bind(null, r);
  r.clearIdentity = clearIdentity.bind(null, r);
  r.ensureIdentity = ensureIdentity.bind(null, r);
  r.ctx.revalidateSessions = () => {
    const previous = r.tickUsers;
    r.tickUsers ??= new Map((r.ctx.state.users ?? []).map((user) => [user.id, user]));
    try {
      for (const p of new Set([...r.players.values(), ...r.sessions.values()])) r.ensureIdentity(p);
    } finally {
      r.tickUsers = previous;
    }
  };
  r.ctx.resumePlayer = (id) => {
    const p = [...r.sessions.values()].find((p) => p.id === id);
    if (!p || !p.disconnectedAt || Date.now() - p.disconnectedAt > 10000 || !r.ensureIdentity(p))
      return null;
    return p;
  };
  r.sendPlayer = sendPlayer.bind(null, r);
  r.ctx.sendPlayer = r.sendPlayer;
  r.presence = createPresence({
    send: r.sendPlayer,
    disconnect: (player, code, reason) => r.disconnect(player.ws, code, reason),
  });
  r.ctx.markPlayerActive = (player) => r.presence.active(player);
  r.broadcast = broadcast.bind(null, r);
  r.ctx.broadcast = r.broadcast;
  r.vehicles = vehicles.bind(null, r);
  r.stats = stats.bind(null, r);
  r.person = person.bind(null, r);
  r.identityPacket = identityPacket.bind(null, r);
  r.names = names.bind(null, r);
  r.ctx.refreshPlayerAppearance = (player) => r.names(player);
  r.snapshot = snapshot.bind(null, r);
  r.relocate = relocate.bind(null, r);
  r.sanitizeEquipment = sanitizeEquipment.bind(null, r);
  r.applyStyle = applyStyle.bind(null, r);
  r.seated = seated.bind(null, r);
  r.input = input.bind(null, r);
  r.wss.on('connection', (ws, req) => connect(r, ws, req));
  r.timer = setInterval(() => tick(r), 50);
  r.timer.unref();
  return {
    wss: r.wss,
    broadcast: r.broadcast,
    stats: r.stats,
    metrics: () => ({
      ...r.counters,
      tickP95Ms:
        [...r.tickDurations].sort((a, b) => a - b)[
          Math.max(0, Math.ceil(r.tickDurations.length * 0.95) - 1)
        ] ?? 0,
      maxNearActorsPerPacket: MAX_NEAR_ACTORS,
      connections: r.wss.clients.size,
      players: r.players.size,
      capacity: r.capacity,
      ticks: r.ticks,
      storageStopped: r.storageStopped,
    }),
    close: () =>
      new Promise((resolve) => {
        if (r.closed) return resolve();
        r.closed = true;
        clearInterval(r.timer);
        for (const ws of r.wss.clients) ws.terminate();
        r.wss.close(() => resolve());
      }),
  };
}
