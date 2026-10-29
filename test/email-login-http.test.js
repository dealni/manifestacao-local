import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalServer } from '../src/server.js';

test('login por código HTTP persiste conta e sessão, conserva identidade e exige apelido', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-email-http-'));
  const emails = [];
  let app;
  let base;
  async function start() {
    app = await createLocalServer({
      dataDir,
      port: 0,
      emailCodeSecret: 'integration-secret-'.repeat(3),
      emailDelivery: {
        available: true,
        async sendCode(payload) {
          emails.push(payload);
        },
      },
    });
    const address = await app.listen();
    base = `http://127.0.0.1:${address.port}`;
  }
  await start();
  t.after(async () => {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  async function json(route, body, cookie) {
    const res = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: res.status,
      body: await res.json(),
      cookie: res.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const email = 'pessoa@example.com';
  assert.equal((await json('/api/me')).body.auth.emailLoginAvailable, true);
  assert.deepEqual(
    (await json('/api/jogos/manifestacao/conta')).body.auth,
    (await json('/api/me')).body.auth,
  );
  const request = await json('/api/auth/email/request', { email });
  assert.equal(request.status, 200);
  assert.equal(emails.length, 1);
  assert.equal(app.ctx.state.users.length, 0);
  const verify = await json('/api/auth/email/verify', { email, code: emails[0].code });
  assert.equal(verify.status, 200);
  assert.equal(verify.body.user.nickPending, true);
  assert.ok(verify.cookie);
  const userId = verify.body.user.id;
  const gameAccount = await json('/api/jogos/manifestacao/conta', undefined, verify.cookie);
  assert.equal(gameAccount.body.user.nickPending, true);
  const nick = await json('/api/profile/nick', { nick: 'Brasileiro' }, verify.cookie);
  assert.equal(nick.status, 200);
  assert.equal(nick.body.user.nickPending, false);
  assert.equal(
    (await json('/api/jogos/manifestacao/conta', undefined, verify.cookie)).body.user.nickPending,
    false,
  );
  assert.equal((await json('/api/auth/email/verify', { email, code: emails[0].code })).status, 400);
  await app.close();
  await start();
  const me = await json('/api/me', undefined, verify.cookie);
  assert.equal(me.body.user.id, userId);
  assert.equal(me.body.user.nick, 'Brasileiro');
  assert.equal(app.ctx.state.users.length, 1);
  await json('/api/auth/logout', {}, verify.cookie);
  assert.equal((await json('/api/me', undefined, verify.cookie)).body.user, null);
});
