import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { handleAuth } from '../src/auth.js';

const password = 'Uma-senha-segura-2026';
function fixture() {
  const salt = 'a'.repeat(32);
  const user = {
    id: 'production-user',
    email: 'jogador@example.com',
    nick: 'Jogador',
    verified: true,
    passwordHash: `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`,
  };
  const state = { users: [user], sessions: {} };
  const ctx = {
    production: true,
    config: { production: true },
    state,
    save() {},
    body: async (req) => req.body,
    send(res, status, payload) {
      res.status = status;
      res.payload = payload;
    },
  };
  async function call(path, body, options = {}) {
    const req = {
      method: body === undefined ? 'GET' : 'POST',
      headers: { host: 'manifestacoes.com', ...options.headers },
      socket: { remoteAddress: options.ip ?? '203.0.113.50' },
      body,
    };
    const res = {
      headers: {},
      setHeader(key, value) {
        this.headers[key] = value;
      },
    };
    await handleAuth(req, res, new URL(path, 'https://manifestacoes.com'), ctx);
    return res;
  }
  return { user, state, call };
}

test('produção bloqueia todos os desafios locais e não permite enumerar contas', async () => {
  const { user, call, state } = fixture();
  user.verification = {
    code: '123456',
    expiresAt: Date.now() + 60000,
    attempts: 0,
  };
  user.resetChallenge = { ...user.verification };
  for (const path of ['register', 'verify', 'resend', 'forgot', 'reset']) {
    const exists = await call(`/api/auth/${path}`, {
      email: user.email,
      code: '123456',
      password,
      nick: 'Jogador',
    });
    const absent = await call(`/api/auth/${path}`, {
      email: 'ausente@example.com',
      code: '123456',
      password,
      nick: 'Jogador',
    });
    assert.equal(exists.status, 503);
    assert.deepEqual(exists.payload, absent.payload);
    assert.equal(exists.payload.local, false);
    assert.ok(!JSON.stringify(exists.payload).includes('123456'));
    assert.ok(!('localCode' in exists.payload));
  }
  assert.equal(state.users.length, 1);
  assert.equal(user.verification.attempts, 0);
  assert.equal(user.resetChallenge.attempts, 0);
});

test('produção emite e remove cookie Secure e expõe capacidades de cadastro honestas', async () => {
  const { user, call, state } = fixture();
  const login = await call('/api/auth/login', { email: user.email, password });
  assert.equal(login.status, 200);
  assert.match(login.headers['Set-Cookie'], /; Secure$/);
  assert.match(login.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
  assert.equal(login.payload.local, false);
  const cookie = login.headers['Set-Cookie'].split(';')[0];
  const me = await call('/api/me', undefined, { headers: { cookie } });
  assert.equal(me.payload.user.id, user.id);
  assert.equal(me.payload.user.local, false);
  assert.deepEqual(me.payload.auth, {
    registrationAvailable: false,
    recoveryAvailable: false,
    emailLoginAvailable: false,
    emailCodeAvailable: false,
    loginMethod: 'email-code',
  });
  const logout = await call('/api/auth/logout', {}, { headers: { cookie } });
  assert.match(logout.headers['Set-Cookie'], /Max-Age=0; Secure$/);
  assert.equal(Object.keys(state.sessions).length, 0);
});

test('login não verificado e contas de demonstração nunca recebem código em produção', async () => {
  const { user, call } = fixture();
  user.verified = false;
  const unverified = await call('/api/auth/login', {
    email: user.email,
    password,
  });
  assert.equal(unverified.status, 503);
  assert.equal(user.verification, undefined);
  assert.ok(!('code' in unverified.payload));
  user.verified = true;
  user.email = 'demo@example.test';
  const demo = await call('/api/auth/login', { email: user.email, password });
  assert.equal(demo.status, 401);
  assert.equal(demo.headers['Set-Cookie'], undefined);
});

test('produção limita login por identidade e IP e não confia em cabeçalho de cliente', async () => {
  const { user, call } = fixture();
  for (let i = 0; i < 10; i++) {
    const attempt = await call(
      '/api/auth/login',
      { email: user.email, password: 'errada' },
      { ip: `203.0.113.${i + 1}` },
    );
    assert.equal(attempt.status, 401);
  }
  const limited = await call(
    '/api/auth/login',
    { email: user.email, password },
    { ip: '203.0.113.100' },
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['Retry-After'], '60');
  for (let i = 0; i < 20; i++) {
    const attempt = await call(
      '/api/auth/register',
      { email: `absent${i}@example.com` },
      {
        ip: '203.0.113.200',
        headers: { 'cf-connecting-ip': `198.51.100.${i}` },
      },
    );
    assert.equal(attempt.status, 503);
  }
  assert.equal(
    (await call('/api/auth/register', { email: 'last@example.com' }, { ip: '203.0.113.200' }))
      .status,
    429,
  );
});
