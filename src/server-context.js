import { randomUUID } from 'node:crypto';
import { getUser, issueAccountTicket } from './auth.js';
import { buildAccount } from './economy.js';
import { projectDir } from './server-values.js';
export function createContext(r) {
  return {
    state: r.state,
    config: r.config,
    runtimeConfig: r.config,
    production: r.config.production,
    freeAccess: r.options.freeAccess !== false,
    persistence: r.persistence,
    emailDelivery: r.emailDelivery,
    catalog: r.catalog,
    dataDir: r.dataDir,
    projectDir,
    publicDir: r.publicDir,
    players: new Map(),
    boot: randomUUID(),
    saveProgress() {
      if (r.progressSaveTimer) return;
      r.progressSaveTimer = setTimeout(() => {
        r.progressSaveTimer = undefined;
        try {
          r.ctx.save();
        } catch {
          r.closing = true;
          r.failClosed();
        }
      }, 500);
      r.progressSaveTimer.unref();
    },
    beginSaveBatch() {
      r.saveBatchDepth++;
    },
    endSaveBatch() {
      if (r.saveBatchDepth > 0) r.saveBatchDepth--;
      if (!r.saveBatchDepth && r.saveBatchDirty) {
        r.saveBatchDirty = false;
        r.ctx.save();
      }
    },
    save() {
      clearTimeout(r.progressSaveTimer);
      r.progressSaveTimer = undefined;
      if (r.saveBatchDepth) {
        r.saveBatchDirty = true;
        return;
      }
      if (r.closing && !r.persistence.health().ok) return;
      r.persistence.save(r.state);
      r.ctx.revalidateSessions?.();
    },
    // Handlers legados chamam send sem await: a resposta só sai após a fila durável.
    send(res, status, payload) {
      if (res.writableEnded || res._localSending) return;
      res._localSending = true;
      return r.persistence
        .flush()
        .then(() => {
          if (res.writableEnded || res.destroyed) return;
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(payload));
        })
        .catch(() => {
          if (res.writableEnded || res.destroyed) return;
          if (res.headersSent) return res.destroy();
          res.writeHead(503, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(
            JSON.stringify({
              error: 'Armazenamento temporariamente indisponível.',
            }),
          );
        });
    },
    async readBody(req) {
      if (req._localBody) return req._localBody;
      let total = 0;
      const chunks = [];
      for await (const chunk of req) {
        total += chunk.length;
        if (total > r.config.maxBodyBytes) {
          const error = new Error('Arquivo excede o limite permitido.');
          error.status = 413;
          throw error;
        }
        chunks.push(chunk);
      }
      req._localBody = Buffer.concat(chunks);
      return req._localBody;
    },
    async body(req) {
      const b = await r.ctx.readBody(req);
      let payload;
      try {
        payload = b.length ? JSON.parse(b.toString('utf8')) : {};
      } catch {
        const error = new Error('JSON inválido.');
        error.status = 400;
        throw error;
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        const error = new Error('Envie um objeto JSON.');
        error.status = 400;
        throw error;
      }
      return payload;
    },
    user(req) {
      return getUser(req, r.state);
    },
    account(req) {
      return buildAccount(r.ctx, r.ctx.user(req), req);
    },
    issueAccountTicket(user, req) {
      return issueAccountTicket(req, r.state, user);
    },
    broadcast() {},
    sendPlayer(player, message) {
      if (player.ws?.readyState === 1) player.ws.send(JSON.stringify(message));
    },
  };
}
