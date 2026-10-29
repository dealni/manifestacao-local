import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { verifyEmailChallenge, allowTurnstileCsp } from '../src/turnstile.js';
import { loadRuntimeConfig } from '../src/runtime-config.js';
import { authAvailability, handleAuth } from '../src/auth.js';

const config = {
  publicOrigin: 'https://manifestacoes.com',
  turnstileSiteKey: 'public-test',
  turnstileSecretKey: 'private-test',
};
const req = { socket: { remoteAddress: '203.0.113.4' }, headers: { 'x-real-ip': '203.0.113.99' } };

test('Turnstile exige chaves completas e origem; desenvolvimento continua sem CAPTCHA por padrão', async () => {
  assert.equal(
    await verifyEmailChallenge(req, undefined, {}, () => {
      throw Error('não chamar');
    }),
    true,
  );
  assert.throws(() => loadRuntimeConfig({}, { TURNSTILE_SITE_KEY: 'key' }), /juntas/);
  assert.throws(
    () => loadRuntimeConfig({}, { TURNSTILE_SITE_KEY: 'key', TURNSTILE_SECRET_KEY: 'secret' }),
    /PUBLIC_ORIGIN/,
  );
  const loaded = loadRuntimeConfig(
    {},
    {
      PUBLIC_ORIGIN: config.publicOrigin,
      TURNSTILE_SITE_KEY: 'key',
      TURNSTILE_SECRET_KEY: 'secret',
    },
  );
  assert.equal(loaded.turnstileSiteKey, 'key');
});

test('validação confirma hostname, action e resultado; falhas e tokens inválidos são rejeitados', async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), {
      secret: 'private-test',
      response: 'single-use-token',
      remoteip: '203.0.113.4',
    });
    return {
      ok: true,
      json: async () => ({ success: true, action: 'email_login', hostname: 'manifestacoes.com' }),
    };
  };
  for (const token of [undefined, null, {}, '', ' ', 'x'.repeat(2049)])
    assert.equal(await verifyEmailChallenge(req, token, config, fetcher), false);
  assert.equal(calls, 0);
  assert.equal(await verifyEmailChallenge(req, 'single-use-token', config, fetcher), true);
  for (const result of [
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
    { success: true, action: 'email_login', hostname: 'evil.example' },
    { success: true, action: 'other', hostname: 'manifestacoes.com' },
  ])
    assert.equal(
      await verifyEmailChallenge(req, 'token', config, async () => ({
        ok: true,
        json: async () => result,
      })),
      false,
    );
  assert.equal(
    await verifyEmailChallenge(req, 'token', config, async () => {
      throw Error('timeout');
    }),
    false,
  );
  assert.equal(
    await verifyEmailChallenge(req, 'token', config, async () => ({ ok: false })),
    false,
  );
});

test('API recusa envio e reenvio sem Turnstile antes de persistir ou enviar e-mail; segredo não é público', async () => {
  let sent = 0,
    saved = 0;
  const state = { users: [], sessions: {} };
  const ctx = {
    production: true,
    config: { ...config, production: true, emailCodeSecret: 's'.repeat(32) },
    state,
    emailDelivery: {
      available: true,
      sendCode: async () => {
        sent++;
      },
    },
    save() {
      saved++;
    },
    body: async (req) => req.body,
    send(res, status, payload) {
      res.status = status;
      res.payload = payload;
    },
  };
  assert.equal(authAvailability(ctx).turnstileSiteKey, 'public-test');
  assert.ok(!JSON.stringify(authAvailability(ctx)).includes('private-test'));
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = { setHeader() {} };
    await handleAuth(
      { ...req, method: 'POST', body: { email: 'pessoa@example.com' } },
      res,
      new URL('/api/auth/email/request', config.publicOrigin),
      ctx,
    );
    assert.equal(res.status, 403);
  }
  assert.equal(sent, 0);
  assert.equal(saved, 0);
  assert.equal(state.emailLoginChallenges, undefined);
});

test('token aprovado libera envio; replay é rejeitado; confirmar OTP não pede outro CAPTCHA', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let validations = 0,
    code,
    sent = 0;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      success: ++validations === 1,
      action: 'email_login',
      hostname: 'manifestacoes.com',
    }),
  });
  const ctx = {
    production: true,
    config: { ...config, production: true, emailCodeSecret: 's'.repeat(32) },
    state: { users: [], sessions: {} },
    save() {},
    persistence: { flush: async () => {} },
    emailDelivery: {
      available: true,
      sendCode: async (payload) => {
        code = payload.code;
        sent++;
      },
    },
    body: async (req) => req.body,
    send(res, status, payload) {
      res.status = status;
      res.payload = payload;
    },
  };
  async function call(route, body) {
    const res = {
      headers: {},
      setHeader(key, value) {
        this.headers[key] = value;
      },
    };
    await handleAuth(
      { ...req, method: 'POST', body },
      res,
      new URL(route, config.publicOrigin),
      ctx,
    );
    return res;
  }
  const body = { email: 'pessoa@example.com', turnstileToken: 'single-use-token' };
  assert.equal((await call('/api/auth/email/request', body)).status, 200);
  assert.equal((await call('/api/auth/email/request', body)).status, 403);
  assert.equal(sent, 1);
  const verified = await call('/api/auth/email/verify', { email: body.email, code });
  assert.equal(verified.status, 200);
  assert.equal(verified.payload.user.verified, true);
  assert.match(verified.headers['Set-Cookie'], /Secure/);
  assert.equal(validations, 2);
});

test('CSP libera apenas origem necessária ao script, conexão e iframe Turnstile', () => {
  const policy = allowTurnstileCsp(
    "script-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none';",
  );
  assert.match(policy, /script-src 'self' https:\/\/challenges\.cloudflare\.com;/);
  assert.match(policy, /frame-src 'self' https:\/\/challenges\.cloudflare\.com;/);
  assert.match(policy, /object-src 'none'/);
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /frame-src 'self' https:\/\/challenges\.cloudflare\.com;/);
});

test('cliente usa token novo no reenvio, remove widget anterior e informa erro do provider', async () => {
  const client = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  const start = client.indexOf('let __turnstileLoading');
  const runtime = client.slice(start, client.indexOf('\nconst ', start));
  assert.ok(runtime.length > 500);
  let active = true,
    count = 0,
    removed = 0,
    options;
  const context = vm.createContext({
    xt: { auth: { turnstileSiteKey: 'public-test' } },
    T: () => ({}),
    window: {
      turnstile: {
        render(_host, opts) {
          count++;
          options = opts;
          return count;
        },
        remove() {
          removed++;
        },
      },
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Error,
  });
  vm.runInContext(runtime + '\nglobalThis.makeChallenge = __emailChallenge;', context);
  const challenge = context.makeChallenge(() => active);
  const first = challenge.token();
  await new Promise(setImmediate);
  assert.equal(options.action, 'email_login');
  options.callback('token-1');
  assert.equal(await first, 'token-1');
  const second = challenge.token();
  await new Promise(setImmediate);
  assert.equal(removed, 1);
  options.callback('token-2');
  assert.equal(await second, 'token-2');
  const failed = challenge.token();
  await new Promise(setImmediate);
  options['error-callback']();
  await assert.rejects(failed, /falhou/);
  active = false;
  await assert.rejects(challenge.token(), /Abra o login/);
});

test('Turnstile libera corpo HTTP rejeitado e mantém falha fechada se a limpeza falhar', async () => {
  let canceled = false;
  const body = new ReadableStream({
    cancel() {
      canceled = true;
    },
  });
  assert.equal(
    await verifyEmailChallenge(
      req,
      'token',
      config,
      async () => new Response(body, { status: 503 }),
    ),
    false,
  );
  assert.equal(canceled, true);
  assert.equal(
    await verifyEmailChallenge(req, 'token', config, async () => ({
      ok: false,
      bodyUsed: false,
      body: {
        cancel: async () => {
          throw Error('cleanup');
        },
      },
    })),
    false,
  );
});
