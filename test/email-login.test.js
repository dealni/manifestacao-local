import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handleAuth } from '../src/auth.js';

async function fixture(t, { production = true, delivery = true, flush = async () => {} } = {}) {
  const deliveries = [];
  const state = { users: [], sessions: {} };
  const ctx = {
    state,
    production,
    config: {
      production,
      emailCodeSecret: 'test-secret-otp-with-more-than-32-characters',
    },
    emailDelivery: {
      available: delivery,
      async sendCode(payload) {
        deliveries.push(payload);
      },
    },
    persistence: { flush },
    save() {},
    async body(req) {
      let value = '';
      for await (const part of req) value += part;
      return JSON.parse(value);
    },
    send(res, status, payload) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    },
  };
  const server = createServer(async (req, res) => {
    try {
      await handleAuth(req, res, new URL(req.url, 'http://localhost'), ctx);
    } catch {
      res.writeHead(503);
      res.end('{}');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  async function call(path, body) {
    const result = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: result.status,
      data: await result.json(),
      cookie: result.headers.get('set-cookie'),
    };
  }
  return { state, ctx, deliveries, call };
}
const email = 'pessoa@example.com';
const request = '/api/auth/email/request';
const verify = '/api/auth/email/verify';

test('OTP produção só cria conta após confirmar e não retorna código nem hash', async (t) => {
  const { call, state, deliveries } = await fixture(t);
  const sent = await call(request, { email: ' Pessoa@Example.com ' });
  assert.equal(sent.status, 200);
  assert.equal(sent.data.localCode, undefined);
  assert.equal(state.users.length, 0);
  const code = deliveries[0].code;
  assert.match(code, /^\d{6}$/);
  assert.ok(!JSON.stringify(state).includes(`"${code}"`));
  const result = await call(verify, { email, code });
  assert.equal(result.status, 200);
  assert.equal(result.data.user.nickPending, true);
  assert.equal(result.data.user.verified, true);
  assert.ok(result.cookie.includes('Secure'));
  assert.equal(state.users.length, 1);
  assert.equal(state.users[0].passwordHash, undefined);
  assert.equal((await call(verify, { email, code })).status, 400);
});

test('OTP concorrente só consome desafio uma vez e reenvio respeita cooldown', async (t) => {
  const { call, state, deliveries } = await fixture(t);
  await call(request, { email });
  assert.equal((await call(request, { email })).status, 429);
  const results = await Promise.all([
    call(verify, { email, code: deliveries[0].code }),
    call(verify, { email, code: deliveries[0].code }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  assert.equal(state.users.length, 1);
  assert.equal(Object.keys(state.sessions).length, 1);
});

test('OTP bloqueia após cinco erros, inclusive código correto posterior', async (t) => {
  const { call, deliveries } = await fixture(t);
  await call(request, { email });
  const code = deliveries[0].code;
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await call(verify, {
          email,
          code: code === '000000' ? '000001' : '000000',
        })
      ).status,
      400,
    );
  assert.equal((await call(verify, { email, code })).status, 400);
});

test('OTP indisponível em produção sem envio ou segredo; local possui fallback', async (t) => {
  const unavailable = await fixture(t, { delivery: false });
  assert.equal((await unavailable.call(request, { email })).status, 503);
  assert.equal((await unavailable.call('/api/me')).data.auth.emailLoginAvailable, false);
  const noSecret = await fixture(t);
  noSecret.ctx.config.emailCodeSecret = '';
  assert.equal((await noSecret.call(request, { email })).status, 503);
  const local = await fixture(t, { production: false, delivery: false });
  const sent = await local.call(request, { email });
  assert.match(sent.data.localCode, /^\d{6}$/);
  assert.equal((await local.call(verify, { email, code: sent.data.localCode })).status, 200);
});

test('OTP não envia antes de persistir; falha do provedor invalida desafio', async (t) => {
  let shouldFail = true;
  const failed = await fixture(t, {
    flush: async () => {
      if (shouldFail) throw Error('storage');
    },
  });
  assert.equal((await failed.call(request, { email })).status, 503);
  assert.equal(failed.deliveries.length, 0);
  shouldFail = false;
  const provider = await fixture(t);
  let attempted;
  provider.ctx.emailDelivery.sendCode = async (payload) => {
    attempted = payload.code;
    throw Error('private provider failure');
  };
  const result = await provider.call(request, { email });
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result.data).includes('private'));
  assert.equal((await provider.call(verify, { email, code: attempted })).status, 400);
});

test('OTP expirado não autentica; sessão não sai se persistência falhar', async (t) => {
  let rejectFlush = false;
  const { call, state, deliveries } = await fixture(t, {
    flush: async () => {
      if (rejectFlush) throw Error('storage');
    },
  });
  await call(request, { email });
  const challenge = Object.values(state.emailLoginChallenges)[0];
  challenge.expiresAt = Date.now() - 1;
  assert.equal((await call(verify, { email, code: deliveries[0].code })).status, 400);
  await call(request, { email });
  rejectFlush = true;
  const result = await call(verify, { email, code: deliveries[1].code });
  assert.equal(result.status, 503);
  assert.equal(result.cookie, null);
});

test('OTP mantém conta existente e impede contas de demonstração em produção', async (t) => {
  const { call, state, deliveries } = await fixture(t);
  state.users.push({
    id: 'existing',
    email,
    nick: 'Pessoa',
    verified: false,
    ink: 123,
    owned: { skins: ['kept'] },
  });
  await call(request, { email });
  const result = await call(verify, { email, code: deliveries[0].code });
  assert.equal(result.data.user.id, 'existing');
  assert.equal(state.users[0].ink, 123);
  assert.deepEqual(state.users[0].owned.skins, ['kept']);
  assert.equal((await call(request, { email: 'demo@example.test' })).status, 400);
});

test('OTP sessão só é entregue após flush final, e segredo persistente valida após novo contexto', async (t) => {
  let flushes = 0;
  const { call, ctx, state, deliveries } = await fixture(t, {
    flush: async () => {
      if (++flushes === 4) throw Error('storage');
    },
  });
  await call(request, { email });
  const result = await call(verify, { email, code: deliveries[0].code });
  assert.equal(result.status, 503);
  assert.equal(result.cookie, null);
  const restarted = await fixture(t);
  restarted.state.emailLoginChallenges = structuredClone(state.emailLoginChallenges);
  assert.equal((await restarted.call(verify, { email, code: deliveries[0].code })).status, 400);
  ctx.persistence.flush = async () => {};
});

test('OTP envio lento de uma identidade não bloqueia verificação de outra', async (t) => {
  const { call, ctx, deliveries } = await fixture(t);
  await call(request, { email });
  const code = deliveries[0].code;
  let release;
  ctx.emailDelivery.sendCode = async () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const slow = call(request, { email: 'outra@example.com' });
  for (let i = 0; i < 50 && !release; i++) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.ok(release);
  const verified = await call(verify, { email, code });
  assert.equal(verified.status, 200);
  release();
  assert.equal((await slow).status, 200);
});

test('OTP mantém quota de envio horária após reinício e código depende do segredo', async (t) => {
  const { call, state, deliveries } = await fixture(t);
  await call(request, { email });
  const restarted = await fixture(t);
  restarted.state.emailLoginChallenges = structuredClone(state.emailLoginChallenges);
  const verified = await restarted.call(verify, {
    email,
    code: deliveries[0].code,
  });
  assert.equal(verified.status, 200);
  const wrong = await fixture(t);
  wrong.state.emailLoginChallenges = structuredClone(state.emailLoginChallenges);
  wrong.ctx.config.emailCodeSecret = 'another-long-secret-with-at-least-32-bytes';
  assert.equal((await wrong.call(verify, { email, code: deliveries[0].code })).status, 400);
  const quotaKey = Object.keys(state.emailLoginSendLimits).find(
    (key) => state.emailLoginChallenges[key],
  );
  state.emailLoginSendLimits[quotaKey].count = 5;
  state.emailLoginChallenges[quotaKey].createdAt = Date.now() - 61000;
  assert.equal((await call(request, { email })).status, 429);
  const retry = await fixture(t);
  retry.state.emailLoginSendLimits = structuredClone(state.emailLoginSendLimits);
  assert.equal((await retry.call(request, { email })).status, 429);
});
