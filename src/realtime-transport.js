import { WebSocket } from 'ws';

export function nextVehicle(r) {
  return r.allocateVehicleId(r.sessions.values());
}

export function setting(r, key, fallback, maximum = 10000) {
  const value = Number(r.ctx.config?.[key]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

export function allow(r, ws, key, limit, duration = 1000) {
  const now = Date.now();
  const bucket = ws.rateBuckets[key];
  if (!bucket || now - bucket.start >= duration) {
    ws.rateBuckets[key] = { start: now, count: 1 };
    return true;
  }
  return ++bucket.count <= limit;
}

export function disconnect(r, ws, code, reason) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.close(code, reason);
  ws.disconnectTimer = setTimeout(() => ws.terminate(), 5000);
  ws.disconnectTimer.unref();
}

export function storageAvailable(r) {
  return r.ctx.persistence?.health?.().ok !== false;
}

export function stopForStorage(r) {
  if (r.storageStopped) return;
  r.storageStopped = true;
  clearInterval(r.timer);
  for (const ws of r.wss.clients)
    r.disconnect(ws, 1013, 'Armazenamento indisponível. Tente novamente.');
}

export function send(r, ws, message) {
  if (ws?.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount >= 1024 * 1024) {
    r.counters.slowConsumers++;
    r.disconnect(ws, 1013, 'Conexão lenta. Reconecte.');
    return;
  }
  const payload =
    typeof message === 'object' && !Buffer.isBuffer(message) && !ArrayBuffer.isView(message)
      ? JSON.stringify(message)
      : message;
  r.counters.sentBytes +=
    typeof payload === 'string' ? Buffer.byteLength(payload) : payload.byteLength;
  ws.send(payload);
}

export function sendPlayer(r, player, message) {
  if (r.ensureIdentity(player)) r.send(player.ws, message);
}

export function broadcast(r, message) {
  // O mesmo evento pode atender toda a sala sem repetir JSON.stringify por conexão.
  const payload =
    typeof message === 'object' && !Buffer.isBuffer(message) && !ArrayBuffer.isView(message)
      ? JSON.stringify(message)
      : message;
  for (const ws of r.wss.clients) r.send(ws, payload);
}
