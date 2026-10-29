import { isAllowedHost, isAllowedOrigin, clientIp } from './runtime-config.js';

const handshakeBuckets = new WeakMap();

// Cada servidor possui seu próprio limite; entradas inativas expiram sem timers.
function acceptHandshake(realtime, ip, limits = {}) {
  const windowMs = limits.windowMs ?? 60_000;
  const maxAttempts = limits.maxAttempts ?? 120;
  const maxAddresses = limits.maxAddresses ?? 10_000;
  const now = Date.now();
  let state = handshakeBuckets.get(realtime);
  if (!state) {
    state = { buckets: new Map(), nextSweep: now };
    handshakeBuckets.set(realtime, state);
  }
  const buckets = state.buckets;
  if (now >= state.nextSweep) {
    for (const [address, bucket] of buckets) {
      if (bucket.expires <= now) buckets.delete(address);
    }
    state.nextSweep = now + Math.min(windowMs, 1000);
  }
  let bucket = buckets.get(ip);
  if (bucket?.expires <= now) {
    buckets.delete(ip);
    bucket = null;
  }
  if (!bucket) {
    if (buckets.size >= maxAddresses) return false;
    bucket = { attempts: 0, expires: now + windowMs };
    buckets.set(ip, bucket);
  }
  bucket.attempts++;
  return bucket.attempts <= maxAttempts;
}

function validLocalOrigin(req, localHost, host) {
  if (!localHost?.(host)) return false;
  if (req.headers.origin) {
    const origin = new URL(req.headers.origin);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.origin !== req.headers.origin ||
      origin.host !== new URL(`${origin.protocol}//${host}`).host
    )
      return false;
  }
  return true;
}

function validUpgradeRequest(req, { realtime, localHost, runtime, handshakeLimits }) {
  const host = req.headers.host;
  if (runtime) {
    if (runtime.production && !acceptHandshake(realtime, clientIp(req, runtime), handshakeLimits))
      return false;
    if (
      !isAllowedHost(req, runtime) ||
      !isAllowedOrigin(req, runtime, { allowMissing: !runtime.production })
    )
      return false;
  } else if (!validLocalOrigin(req, localHost, host)) return false;

  // Upgrades são recursos deste servidor, nunca destinos absolutos de proxy.
  if (
    typeof req.url !== 'string' ||
    !req.url.startsWith('/') ||
    req.url.startsWith('//') ||
    /[\\#\s]/.test(req.url)
  )
    return false;
  return true;
}

// Falhas no handshake pertencem à conexão, nunca ao processo HTTP inteiro.
// A assinatura local continua disponível para consumidores e testes existentes.
export function handleLocalUpgrade(
  req,
  socket,
  head,
  { realtime, localHost, runtime, handshakeLimits },
) {
  try {
    const host = req.headers.host;
    if (!validUpgradeRequest(req, { realtime, localHost, runtime, handshakeLimits }))
      return socket.destroy();
    const base = new URL(`http://${host}`);
    const url = new URL(req.url, base);
    if (
      url.protocol !== 'http:' ||
      url.host !== base.host ||
      url.username ||
      url.password ||
      url.hash
    )
      return socket.destroy();
    const target = url.pathname === '/ws' ? realtime.wss : null;
    if (!target) return socket.destroy();
    target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req));
  } catch {
    socket.destroy();
  }
}
