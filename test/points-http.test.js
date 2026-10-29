import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalServer } from '../src/server.js';

test('convite HTTP: crédito bilateral após código e apelido, resgate persiste e não duplica após reinício', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-points-http-'));
  let app, base;
  async function start() {
    app = await createLocalServer({
      freeAccess: false,
      dataDir,
      port: 0,
      emailCodeSecret: 'http-test-secret'.repeat(3),
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
  const points = (cookie) => json('/api/jogos/manifestacao/pontos', undefined, cookie);
  async function signup(email, referralCode) {
    const request = await json('/api/auth/email/request', { email, referralCode });
    assert.equal(request.status, 200);
    const verified = await json('/api/auth/email/verify', {
      email,
      code: request.body.localCode,
      referralCode: 'tampered_code_ignored',
    });
    assert.equal(verified.status, 200);
    return verified;
  }
  const inviter = await signup('inviter@example.test');
  assert.equal(
    (await points(inviter.cookie)).body.balance,
    0,
    'sem prêmio antes de concluir apelido',
  );
  await json('/api/profile/nick', { nick: 'Convidante' }, inviter.cookie);
  const before = await points(inviter.cookie);
  assert.equal(before.body.balance, 300);
  assert.match(before.body.referral.url, /\?convite=/);
  const invited = await signup('invited@example.test', before.body.referral.code);
  assert.equal((await points(inviter.cookie)).body.balance, 300);
  await json('/api/profile/nick', { nick: 'Convidado' }, invited.cookie);
  assert.equal((await points(inviter.cookie)).body.balance, 400);
  assert.equal((await points(inviter.cookie)).body.referral.rewardedInvites, 1);
  assert.equal((await points(invited.cookie)).body.balance, 400);
  await json('/api/profile/nick', { nick: 'Convidado2' }, invited.cookie);
  assert.equal(
    (await points(inviter.cookie)).body.balance,
    400,
    'alterar apelido não repete recompensa',
  );
  const buy = await json(
    '/api/jogos/manifestacao/personagem',
    { key: 'alborghetti', amount: 0, cents: 0, requestId: 'owned-avatar-request' },
    invited.cookie,
  );
  assert.equal(buy.status, 200);
  assert.equal(buy.body.pointsCost, 300);
  assert.equal((await points(invited.cookie)).body.balance, 100);
  await app.close();
  await start();
  assert.equal((await points(invited.cookie)).body.balance, 100);
  assert.equal((await points(inviter.cookie)).body.balance, 400);
  const retry = await json(
    '/api/jogos/manifestacao/personagem',
    { key: 'alborghetti', requestId: 'owned-avatar-request' },
    invited.cookie,
  );
  assert.equal(retry.status, 200);
  assert.equal((await points(invited.cookie)).body.balance, 100);
  assert.equal(
    (await json('/api/jogos/manifestacao/pontos', { amount: 100000 }, invited.cookie)).status,
    405,
  );
  assert.equal((await json('/api/jogos/manifestacao/pagamentos', {}, invited.cookie)).status, 503);
  assert.equal((await points()).status, 401);
});
