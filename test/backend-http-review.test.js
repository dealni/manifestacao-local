import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalServer } from '../src/server.js';

test('HTTP rejeita JSON sem objeto antes de alterar audiência, designs ou pontos', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-http-review-'));
  const app = await createLocalServer({ dataDir, port: 0 });
  t.after(async () => {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const address = await app.listen();
  const origin = `http://127.0.0.1:${address.port}`;
  const token = 'a'.repeat(64);
  const user = {
    id: 'http-review',
    email: 'http-review@example.test',
    nick: 'PessoaTeste',
    verified: true,
  };
  app.ctx.state.users.push(user);
  app.ctx.state.sessions[token] = { userId: user.id, expiresAt: Date.now() + 60000 };
  // Inicializa apenas as coleções que o handler cria também em consultas válidas.
  Object.assign(app.ctx.state, { mediaBids: [], mediaPurchases: {}, superchats: [] });
  app.ctx.save();
  const before = structuredClone(app.ctx.state);
  for (const route of ['telao/audiencia', 'cartaz/ativar', 'telao/lance', 'superchat']) {
    for (const body of ['null', '[]', '"texto"', '42', 'false']) {
      const response = await fetch(`${origin}/api/jogos/manifestacao/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `local_session=${token}` },
        body,
      });
      assert.equal(response.status, 400, `${route}: ${body}`);
      assert.match((await response.json()).error, /objeto JSON/);
      assert.deepEqual(app.ctx.state, before, `${route}: ${body} não pode alterar o estado`);
    }
  }
  const valid = await fetch(`${origin}/api/jogos/manifestacao/telao/audiencia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: true }),
  });
  assert.equal(valid.status, 200);
  assert.equal(app.ctx.state.mediaAudience.pageViews, 1);
});
