import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Deliberately ignore deployment secrets, database URLs and persistent data paths.
process.env = { PATH: process.env.PATH, NODE_ENV: 'test' };
const { createLocalServer } = await import('../../src/server.js');
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'manifestacao-browser-'));
let app;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try {
    await app?.close();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    close().then(
      () => process.exit(0),
      (error) => {
        console.error(error);
        process.exit(1);
      },
    );
  });
}
try {
  // Os 32 contextos isolados fazem downloads com cache frio no mesmo IP.
  // Mantenha o limitador ativo sem esgotar a cota compartilhada da fixture QA.
  app = await createLocalServer({
    dataDir,
    databaseUrl: null,
    host: '127.0.0.1',
    port: 4179,
    rateLimitRequests: 10000,
  });
  await app.listen();
  console.log('Browser QA: http://127.0.0.1:4179 (dados temporários)');
} catch (error) {
  await close();
  throw error;
}
