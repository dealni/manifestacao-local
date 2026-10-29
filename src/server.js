import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmailDelivery } from './email-delivery.js';
import { initializeWallet, ensureReferralCode } from './points.js';
import { attachRealtime } from './realtime.js';
import { handleLocalUpgrade } from './upgrade.js';
import { createRuntimeConfig, createRateLimiter } from './runtime-config.js';
import { createPersistence } from './persistence.js';
import { staticFile } from './server-static.js';
import { createContext } from './server-context.js';
import { handleRequest } from './server-request.js';
import { serverHandle } from './server-lifecycle.js';
import { projectDir, localHost } from './server-values.js';
/** Inicializa persistência e contexto antes de aceitar HTTP e WebSocket. */
export async function createLocalServer(options = {}) {
  const r = { options };
  r.config = createRuntimeConfig(r.options);
  r.emailDelivery = r.options.emailDelivery ?? createEmailDelivery(r.config);
  r.dataDir = path.resolve(r.config.dataDir ?? r.options.dataDir ?? path.join(projectDir, 'data'));
  r.limiter = createRateLimiter(r.config);
  r.closing = false;
  r.failClosed = () => {};
  r.closePromise = undefined;
  r.publicDir = path.resolve(
    r.config.publicDir ?? r.options.publicDir ?? path.join(projectDir, 'public'),
  );
  r.canonicalPublicDir = await fs.promises.realpath(r.publicDir).catch(() => r.publicDir);
  fs.mkdirSync(r.dataDir, { recursive: true });
  r.defaults = {
    version: 1,
    users: [],
    sessions: {},
    purchases: {},
    designs: [],
    media: [],
    world: {},
  };
  r.persistence = await createPersistence({
    dataDir: r.dataDir,
    defaults: r.defaults,
    config: r.config,
    onError() {
      console.error('[brasilia] Falha ao persistir dados; serviço indisponível até recuperação.');
      r.closing = true;
      r.failClosed();
    },
  });
  r.state = r.persistence.state;
  for (const user of r.state.users) {
    initializeWallet(r.state, user);
    ensureReferralCode(r.state, user);
  }
  r.persistence.save(r.state);
  await r.persistence.flush();
  r.catalog = JSON.parse(fs.readFileSync(path.join(projectDir, 'data/catalog.json'), 'utf8')).items;
  r.progressSaveTimer = undefined;
  r.saveBatchDepth = 0;
  r.saveBatchDirty = false;
  r.ctx = createContext(r);
  r.staticFile = staticFile.bind(null, r);
  r.server = http.createServer((req, res) => handleRequest(r, req, res));
  r.realtime = attachRealtime(r.server, r.ctx);
  r.ctx.broadcast = r.realtime.broadcast;
  r.failClosed = () => {
    void r.realtime.close();
    r.server.close();
    // Keep liveness unavailable and release the writer before process supervision restarts it.
    void r.persistence.close().catch(() => {});
    r.options.onFatal?.();
  };
  r.server.requestTimeout = 30000;
  r.server.headersTimeout = 15000;
  r.server.keepAliveTimeout = 5000;
  r.server.on('upgrade', (req, socket, head) =>
    handleLocalUpgrade(req, socket, head, {
      realtime: r.realtime,
      localHost,
      runtime: r.config,
    }),
  );
  return serverHandle(r);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createLocalServer({
    onFatal() {
      process.exitCode = 1;
    },
  });
  const address = await app.listen();
  console.log(`Brasília Livre: http://127.0.0.1:${address.port}`);
  console.log('Compras simuladas · dados nesta máquina · nenhuma conexão ao serviço original');
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      app.close().then(
        () => process.exit(0),
        () => {
          console.error('[brasilia] Encerramento com falha de persistência.');
          process.exit(1);
        },
      );
    });
}
