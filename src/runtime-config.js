/** @typedef {import('../types/runtime-config.js').RuntimeOptions} RuntimeOptions */
/** @typedef {import('../types/runtime-config.js').NumericOptions} NumericOptions */
/** @typedef {import('../types/runtime-config.js').RuntimeRequest} RuntimeRequest */
/** @typedef {ReturnType<typeof loadRuntimeConfig>} RuntimeConfig */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const localAuthority = /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/i;

/** @param {number | string | undefined} value @param {number} fallback @param {string} name @param {number} min @param {number} max */
function integer(value, fallback, name, min, max) {
  if (value === undefined || value === '') return fallback;
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max)
    throw new Error(`${name} deve ser um inteiro entre ${min} e ${max}.`);
  return result;
}

/** @param {string} turnstileSiteKey @param {string} turnstileSecretKey @param {string | null} publicOrigin @param {boolean} production @param {string} emailApiToken @param {string} emailCodeSecret */
function validateMailConfig(
  turnstileSiteKey,
  turnstileSecretKey,
  publicOrigin,
  production,
  emailApiToken,
  emailCodeSecret,
) {
  if (!!turnstileSiteKey !== !!turnstileSecretKey)
    throw new Error('Turnstile exige TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY juntas.');
  if (turnstileSiteKey && !publicOrigin)
    throw new Error('Turnstile exige PUBLIC_ORIGIN para validar o hostname.');
  if (
    production &&
    emailApiToken &&
    (typeof emailCodeSecret !== 'string' || emailCodeSecret.length < 32)
  )
    throw new Error(
      'Login por e-mail exige EMAIL_CODE_SECRET estável com pelo menos 32 caracteres.',
    );
}

/** @param {RuntimeOptions} options @param {NodeJS.ProcessEnv} env @param {boolean} production @param {string | null} publicOrigin */
function mailConfig(options, env, production, publicOrigin) {
  const emailApiToken = options.emailApiToken ?? env.CLOUDFLARE_EMAIL_API_TOKEN ?? '';
  const emailCodeSecret = options.emailCodeSecret ?? env.EMAIL_CODE_SECRET ?? '';
  const turnstileSiteKey = options.turnstileSiteKey ?? env.TURNSTILE_SITE_KEY ?? '';
  const turnstileSecretKey = options.turnstileSecretKey ?? env.TURNSTILE_SECRET_KEY ?? '';
  validateMailConfig(
    turnstileSiteKey,
    turnstileSecretKey,
    publicOrigin,
    production,
    emailApiToken,
    emailCodeSecret,
  );
  return {
    emailAccountId: options.emailAccountId ?? env.CLOUDFLARE_ACCOUNT_ID ?? '',
    emailApiToken,
    emailFrom: options.emailFrom ?? env.CLOUDFLARE_EMAIL_FROM ?? '',
    emailReplyTo: options.emailReplyTo ?? env.CLOUDFLARE_EMAIL_REPLY_TO ?? '',
    emailCodeSecret,
    turnstileSiteKey,
    turnstileSecretKey,
  };
}

/** @param {(option: keyof NumericOptions, key: string, fallback: number, min: number, max: number) => number} number */
function capacityConfig(number) {
  return {
    maxBodyBytes: number(
      'maxBodyBytes',
      'MAX_BODY_BYTES',
      20 * 1024 * 1024,
      1024,
      100 * 1024 * 1024,
    ),
    maxPlayers: number('maxPlayers', 'MAX_PLAYERS', 1000, 1, 1000),
    maxConnectionsPerIp: number('maxConnectionsPerIp', 'MAX_CONNECTIONS_PER_IP', 10, 1, 1000),
    maxUploadsBytes: number(
      'maxUploadsBytes',
      'MAX_UPLOADS_BYTES',
      2 * 1024 * 1024 * 1024,
      1024,
      Number.MAX_SAFE_INTEGER,
    ),
    wsMaxConnections: number('wsMaxConnections', 'WS_MAX_CONNECTIONS', 1200, 1, 10000),
    wsMessagesPerSecond: number('wsMessagesPerSecond', 'WS_MESSAGES_PER_SECOND', 120, 1, 10000),
    wsChatPer10Seconds: number('wsChatPer10Seconds', 'WS_CHAT_PER_10_SECONDS', 8, 1, 1000),
    wsActionsPerSecond: number('wsActionsPerSecond', 'WS_ACTIONS_PER_SECOND', 20, 1, 1000),
    wsJoinPerMinute: number('wsJoinPerMinute', 'WS_JOIN_PER_MINUTE', 30, 1, 1000),
    rateLimit: Object.freeze({
      requests: number('rateLimitRequests', 'RATE_LIMIT_REQUESTS', 600, 1, 100000),
      windowMs: number('rateLimitWindowMs', 'RATE_LIMIT_WINDOW_MS', 60000, 1000, 3600000),
    }),
  };
}

/** @param {string | undefined} rawOrigin @param {boolean} production */
function parsePublicOrigin(rawOrigin, production) {
  let publicOrigin = null;
  if (rawOrigin) {
    const parsed = new URL(rawOrigin);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== '/'
    )
      throw new Error(
        'PUBLIC_ORIGIN deve conter somente a origem HTTP(S), sem caminho ou credenciais.',
      );
    publicOrigin = parsed.origin;
  }
  if (production && (!publicOrigin || !publicOrigin.startsWith('https://')))
    throw new Error('Produção exige PUBLIC_ORIGIN HTTPS explícita.');
  return publicOrigin;
}

/** @param {string | undefined} value */
function loopbackHost(value) {
  const host = value ?? '127.0.0.1';
  if (!['localhost', '127.0.0.1', '::1'].includes(host))
    throw new Error('HOST deve usar loopback; publique através do proxy HTTPS.');
  return host;
}

/** @param {RuntimeOptions} [options] @param {NodeJS.ProcessEnv} [env] */
export function loadRuntimeConfig(options = {}, env = process.env) {
  const production = options.production ?? env.NODE_ENV === 'production';
  const publicOrigin = parsePublicOrigin(options.publicOrigin ?? env.PUBLIC_ORIGIN, production);
  /** @param {keyof NumericOptions} option @param {string} key @param {number} fallback @param {number} min @param {number} max */
  const number = (option, key, fallback, min, max) =>
    integer(options[option] ?? env[key], fallback, key, min, max);
  const host = loopbackHost(options.host ?? env.HOST);
  const mail = mailConfig(options, env, production, publicOrigin);
  return Object.freeze({
    production,
    publicOrigin,
    publicHost: publicOrigin ? new URL(publicOrigin).host : null,
    secureCookies: !!production,
    ...mail,
    emailDeliveryTimeoutMs: number(
      'emailDeliveryTimeoutMs',
      'EMAIL_DELIVERY_TIMEOUT_MS',
      20000,
      1000,
      60000,
    ),
    databaseUrl: options.databaseUrl ?? env.DATABASE_URL ?? null,
    databaseStateKey: options.databaseStateKey ?? env.DATABASE_STATE_KEY ?? 'manifestacao',
    dataDir: path.resolve(options.dataDir ?? env.DATA_DIR ?? path.join(projectDir, 'data')),
    publicDir: path.resolve(options.publicDir ?? env.PUBLIC_DIR ?? path.join(projectDir, 'public')),
    host,
    port: number('port', 'PORT', 4173, 0, 65535),
    trustProxy: options.trustProxy ?? env.TRUST_PROXY !== 'false',
    ...capacityConfig(number),
  });
}

export const createRuntimeConfig = loadRuntimeConfig;
export const runtimeConfigFromEnv = loadRuntimeConfig;

/** @param {RuntimeRequest} req @param {RuntimeConfig} config */
export function isTrustedProxy(req, config) {
  return !!config?.trustProxy && LOOPBACK.has(req?.socket?.remoteAddress ?? '');
}

/** @param {RuntimeRequest} req @param {RuntimeConfig} config */
export function requestProtocol(req, config) {
  if (req?.socket?.encrypted) return 'https';
  if (isTrustedProxy(req, config) && req.headers?.['x-forwarded-proto'] === 'https') return 'https';
  return 'http';
}

/** @param {RuntimeRequest} req @param {RuntimeConfig} config */
export function clientIp(req, config) {
  if (isTrustedProxy(req, config)) {
    // Nginx sobrescreve X-Real-IP após validar a origem Cloudflare. Nunca usar o primeiro X-Forwarded-For enviado pelo visitante.
    const forwarded = req.headers?.['x-real-ip'];
    if (typeof forwarded === 'string' && isIP(forwarded)) return forwarded;
  }
  return req?.socket?.remoteAddress ?? 'unknown';
}

/** @param {RuntimeRequest} req @param {RuntimeConfig} config */
export function isAllowedHost(req, config) {
  const host = req?.headers?.host;
  if (typeof host !== 'string' || host.includes(',') || /[\s\\/@?#]/.test(host)) return false;
  if (config?.production) return host.toLowerCase() === config.publicHost?.toLowerCase();
  const local = localAuthority.exec(host);
  return !!local && (local[2] === undefined || Number(local[2]) <= 65535);
}

/** @param {RuntimeRequest} req @param {RuntimeConfig} config */
export function isAllowedOrigin(req, config, { allowMissing = true } = {}) {
  const origin = req?.headers?.origin;
  if (origin === undefined) return allowMissing;
  if (typeof origin !== 'string') return false;
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) return false;
    if (config?.production) return origin === config.publicOrigin;
    if (!isAllowedHost(req, config)) return false;
    // URL normaliza caixa do hostname e remove portas padrão. Compare as
    // autoridades normalizadas para aceitar o mesmo endereço HTTP legitimamente.
    const authority = new URL(`${parsed.protocol}//${req.headers.host}`).host;
    return parsed.host === authority && localAuthority.test(parsed.host);
  } catch {
    return false;
  }
}

/** @param {RuntimeConfig} config @param {{ now?: () => number, maxEntries?: number }} [options] */
export function createRateLimiter(config, { now = Date.now, maxEntries = 10000 } = {}) {
  /** @type {Map<string, { count: number, until: number }>} */
  const entries = new Map();
  return {
    /** @param {RuntimeRequest} req @param {{bucket?: string, limit?: number, windowMs?: number, cost?: number}} [options] */
    check(
      req,
      {
        bucket = 'http',
        limit = config.rateLimit.requests,
        windowMs = config.rateLimit.windowMs,
        cost = 1,
      } = {},
    ) {
      const time = now();
      const key = `${bucket}:${clientIp(req, config)}`;
      let record = entries.get(key);
      if (!record || record.until <= time) {
        if (entries.size >= maxEntries) {
          for (const [oldKey, old] of entries) if (old.until <= time) entries.delete(oldKey);
          // Falha fechada: tráfego de IPs novos não pode expulsar limites ainda ativos.
          if (!entries.has(key) && entries.size >= maxEntries)
            return { allowed: false, remaining: 0, retryAfter: Math.ceil(windowMs / 1000) };
        }
        record = { count: 0, until: time + windowMs };
        entries.set(key, record);
      }
      const allowed = record.count + cost <= limit;
      if (allowed) record.count += cost;
      return {
        allowed,
        remaining: Math.max(0, limit - record.count),
        retryAfter: allowed ? 0 : Math.max(1, Math.ceil((record.until - time) / 1000)),
      };
    },
    get size() {
      return entries.size;
    },
  };
}
