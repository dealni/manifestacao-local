import { handleAuth } from './auth.js';
import { allowTurnstileCsp, turnstileEnabled } from './turnstile.js';
import { handlePoints } from './points-api.js';
import { handleEconomy } from './economy.js';
import { handleMedia } from './media.js';
import { handleWorldHttp } from './world-actions.js';
import { isAllowedHost, isAllowedOrigin, requestProtocol } from './runtime-config.js';
import { servePublic } from './server-public.js';
export async function handleRequest(r, req, res) {
  setHeaders(r, req, res);
  try {
    if (!requestAllowed(r, req, res)) return;
    const url = new URL(req.url, `${requestProtocol(req, r.config)}://${req.headers.host}`);
    if (url.pathname.startsWith('/manifestacao/'))
      url.pathname = url.pathname.slice('/manifestacao'.length);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (informationalRoute(r, req, res, url)) return;
    if (await applicationRoute(r, req, res, url)) return;
    return await servePublic(r, req, res, url);
  } catch (error) {
    if (!res.headersSent)
      r.ctx.send(res, error.status ?? 500, {
        error: error.status && error.status < 500 ? error.message : 'Erro no servidor.',
        local: true,
      });
    else res.destroy();
    // Não registrar URL/query, headers, corpo ou stack que possam conter credenciais.
    console.error('[brasilia] Falha HTTP', {
      method: req.method,
      status: error.status ?? 500,
    });
  }
}
function setHeaders(r, req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()');
  res.setHeader(
    'Content-Security-Policy',
    r.config.production
      ? "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: data:; connect-src 'self' blob: data: ws://127.0.0.1:* ws://localhost:*; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'".replace(
          ' ws://127.0.0.1:* ws://localhost:*',
          ` ${r.config.publicOrigin.replace(/^https:/, 'wss:')}`,
        )
      : "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: data:; connect-src 'self' blob: data: ws://127.0.0.1:* ws://localhost:*; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  );
}
function requestAllowed(r, req, res) {
  const reject = (...args) => {
    r.ctx.send(...args);
    return false;
  };
  if (turnstileEnabled(r.config))
    res.setHeader(
      'Content-Security-Policy',
      allowTurnstileCsp(res.getHeader('Content-Security-Policy')),
    );
  if (!isAllowedHost(req, r.config)) return reject(res, 403, { error: 'Host não permitido.' });
  if (!isAllowedOrigin(req, r.config)) return reject(res, 403, { error: 'Origem não permitida.' });
  if (r.config.production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  const rate = r.limiter.check(req);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    return reject(res, 429, {
      error: 'Muitas solicitações. Aguarde e tente novamente.',
    });
  }
  if (r.closing) return reject(res, 503, { error: 'Servidor reiniciando.' });
  if (!req.url?.startsWith('/') || req.url.startsWith('//') || /[\\#\s]/.test(req.url))
    return reject(res, 400, { error: 'Caminho inválido.' });

  return true;
}
function informationalRoute(r, req, res, url) {
  const handled = (...args) => {
    r.ctx.send(...args);
    return true;
  };
  if (url.pathname === '/health' || url.pathname === '/ready') {
    const storage = r.persistence.health();
    return handled(res, storage.ok ? 200 : 503, {
      ok: storage.ok,
      local: !r.config.production,
      version: 1,
      players: r.ctx.players.size,
      mode: r.config.production ? 'beta-gratuito' : 'local',
      storage: storage.backend,
    });
  }
  if (url.pathname === '/servidores') {
    const stats = r.realtime.stats();
    return handled(res, 200, {
      total: r.ctx.players.size,
      servers: [
        {
          id: 1,
          name: r.config.production ? 'Brasília Livre · Beta gratuito' : 'Servidor local',
          ws: `${r.config.production ? r.config.publicOrigin.replace(/^https:/, 'wss:') : `ws://${req.headers.host}`}/ws`,
          online: r.ctx.players.size,
          players: r.ctx.players.size,
          capacity: r.config.maxPlayers,
          open: r.ctx.players.size < r.config.maxPlayers,
          full: r.ctx.players.size >= r.config.maxPlayers,
        },
      ],
      ...stats,
      local: !r.config.production,
      freeBeta: r.config.production,
    });
  }

  return false;
}

async function applicationRoute(r, req, res, url) {
  if (await handleAuth(req, res, url, r.ctx)) return true;
  if (await handlePoints(req, res, url, r.ctx)) return true;
  if (await handleEconomy(req, res, url, r.ctx)) return true;
  if (await handleMedia(req, res, url, r.ctx)) return true;
  if (await handleWorldHttp(req, res, url, r.ctx)) return true;
  return false;
}
