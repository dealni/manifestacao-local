import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handleAuth, getUser, issueAccountTicket, resolveAccountTicket } from '../src/auth.js';

async function fixture(t) {
  const state = { users: [], sessions: {} };
  const ctx = {
    state,
    save() {},
    send(res, status, payload) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    },
    async body(req) {
      let data = '';
      for await (const part of req) data += part;
      return JSON.parse(data);
    },
  };
  const server = createServer(async (req, res) => {
    try {
      if (!(await handleAuth(req, res, new URL(req.url, 'http://localhost'), ctx))) {
        res.writeHead(404);
        res.end('{}');
      }
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, body, cookie, extra = {}) {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  return { state, call };
}
const registration = {
  email: 'jogador@example.test',
  nick: 'Jogador',
  password: 'senha-local-123',
};

test('conta persiste sem senha legível; verificação e sessão são compatíveis com o cliente', async (t) => {
  const { state, call } = await fixture(t);
  const created = await call('/api/auth/register', registration);
  assert.equal(created.status, 200);
  assert.match(created.data.localCode, /^\d{6}$/);
  assert.equal(created.data.needVerify, true);
  assert.match(state.users[0].passwordHash, /^scrypt\$/);
  assert.ok(!state.users[0].passwordHash.includes(registration.password));
  assert.equal((await call('/api/me')).data.user, null);
  const verified = await call('/api/auth/verify', {
    email: registration.email,
    code: created.data.localCode,
  });
  assert.equal(verified.status, 200);
  assert.match(verified.cookie, /^local_session=[a-f0-9]{64}$/);
  const me = await call('/api/me', undefined, verified.cookie);
  assert.equal(me.data.user.nick, 'Jogador');
  assert.ok(!JSON.stringify(me.data).includes('passwordHash'));
  const security = await call('/api/payment-security', undefined, verified.cookie);
  assert.equal(security.data.authenticated, true);
  assert.equal(security.data.captchaRequired, false);
  assert.equal(
    (await call('/api/profile/nick', { nick: 'Novo nome' }, verified.cookie)).data.user.nick,
    'Novo nome',
  );
  assert.equal(
    (
      await call('/api/auth/verify', {
        email: registration.email,
        code: created.data.localCode,
      })
    ).status,
    400,
  );
  await call('/api/auth/logout', {}, verified.cookie);
  assert.equal((await call('/api/me', undefined, verified.cookie)).data.user, null);
  const login = await call('/api/auth/login', {
    email: registration.email,
    password: registration.password,
  });
  assert.equal(login.status, 200);
  assert.ok(login.cookie);
});

test('reset consome código, altera senha e revoga as sessões anteriores', async (t) => {
  const { state, call } = await fixture(t);
  const created = await call('/api/auth/register', registration);
  const verified = await call('/api/auth/verify', {
    email: registration.email,
    code: created.data.localCode,
  });
  const forgot = await call('/api/auth/forgot', { email: registration.email });
  assert.ok(forgot.data.message.includes('Nenhum e-mail'));
  const reset = await call('/api/auth/reset', {
    email: registration.email,
    code: forgot.data.localCode,
    password: 'senha-alterada-123',
  });
  assert.equal(reset.status, 200);
  assert.equal(getUser({ headers: { cookie: verified.cookie } }, state), null);
  assert.equal(
    (
      await call('/api/auth/login', {
        email: registration.email,
        password: registration.password,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call('/api/auth/login', {
        email: registration.email,
        password: 'senha-alterada-123',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call('/api/auth/reset', {
        email: registration.email,
        code: forgot.data.localCode,
        password: 'senha-outra-123',
      })
    ).status,
    400,
  );
});

test('rejeita código expirado, tentativas excessivas, origem alheia e sessão vencida', async (t) => {
  const { state, call } = await fixture(t);
  const created = await call('/api/auth/register', registration);
  const account = state.users[0];
  account.verification.expiresAt = Date.now() - 1;
  assert.equal(
    (
      await call('/api/auth/verify', {
        email: registration.email,
        code: created.data.localCode,
      })
    ).status,
    400,
  );
  const resend = await call('/api/auth/resend', { email: registration.email });
  const wrong = resend.data.localCode === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await call('/api/auth/verify', {
          email: registration.email,
          code: wrong,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await call('/api/auth/verify', {
        email: registration.email,
        code: resend.data.localCode,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call('/api/auth/register', registration, undefined, {
        origin: 'https://outro.example',
      })
    ).status,
    403,
  );
  const token = 'a'.repeat(64);
  state.sessions[token] = { userId: account.id, expiresAt: Date.now() - 1 };
  assert.equal(getUser({ headers: { cookie: `local_session=${token}` } }, state), null);
  assert.equal((await call('/api/profile/nick', { nick: 'Nova' })).status, 401);
});

test('login não cria sessão se a senha for alterada durante o scrypt', async (t) => {
  const { state, call } = await fixture(t);
  await call('/api/auth/register', registration);
  const user = state.users[0];
  user.verified = true;
  const res = {
    setHeader() {
      throw new Error('Não deve emitir cookie.');
    },
  };
  const ctx = {
    state,
    body: async () => registration,
    save() {
      throw new Error('Login inválido não deve salvar.');
    },
    send(response, status, payload) {
      Object.assign(response, { status, payload });
    },
  };
  const pending = handleAuth(
    { method: 'POST', headers: {} },
    res,
    new URL('http://localhost/api/auth/login'),
    ctx,
  );
  // A leitura do corpo terminou e o scrypt já capturou o hash original.
  await Promise.resolve();
  user.passwordHash = 'senha-revogada-durante-validacao';
  await pending;
  assert.equal(res.status, 401);
  assert.deepEqual(state.sessions, {});
});

test('OAuth oferece instrução local e registro valida campos', async (t) => {
  const { call } = await fixture(t);
  const oauth = await call('/api/auth/google');
  assert.equal(oauth.status, 200);
  assert.ok(oauth.data.error.includes('OAuth externo desativado'));
  assert.equal(
    (await call('/api/auth/register', { ...registration, password: 'curta' })).status,
    400,
  );
  assert.equal((await call('/api/auth/register', { ...registration, nick: 'a' })).status, 400);
  assert.equal(
    (await call('/api/auth/register', { ...registration, email: 'invalido' })).status,
    400,
  );
});

test('troca de sessão revoga ticket antigo e logout preserva outro dispositivo', async (t) => {
  const { state, call } = await fixture(t);
  const created = await call('/api/auth/register', registration);
  const verified = await call('/api/auth/verify', {
    email: registration.email,
    code: created.data.localCode,
  });
  const user = state.users[0];
  const firstRequest = { headers: { cookie: verified.cookie } };
  const firstTicket = issueAccountTicket(firstRequest, state, user);
  assert.equal(resolveAccountTicket(firstTicket, state)?.user.id, user.id);

  const secondDevice = await call('/api/auth/login', registration);
  const secondTicket = issueAccountTicket(
    { headers: { cookie: secondDevice.cookie } },
    state,
    user,
  );
  const rotated = await call('/api/auth/login', registration, verified.cookie);
  assert.ok(rotated.cookie);
  assert.notEqual(rotated.cookie, verified.cookie);
  assert.equal(getUser(firstRequest, state), null);
  assert.equal(resolveAccountTicket(firstTicket, state), null);
  assert.equal(resolveAccountTicket(secondTicket, state)?.user.id, user.id);

  const rotatedTicket = issueAccountTicket({ headers: { cookie: rotated.cookie } }, state, user);
  await call('/api/auth/logout', {}, rotated.cookie);
  assert.equal(resolveAccountTicket(rotatedTicket, state), null);
  assert.equal((await call('/api/me', undefined, rotated.cookie)).data.user, null);
  assert.equal((await call('/api/me', undefined, secondDevice.cookie)).data.user.id, user.id);
});

test('logout e rotação usam o mesmo cookie normalizado da leitura de sessão', async (t) => {
  const { state, call } = await fixture(t);
  const created = await call('/api/auth/register', registration);
  const verified = await call('/api/auth/verify', {
    email: registration.email,
    code: created.data.localCode,
  });
  const spacedCookie = `other=value; ${verified.cookie} ; trailing=value`;
  const request = { headers: { cookie: spacedCookie } };
  const user = state.users[0];
  const oldTicket = issueAccountTicket(request, state, user);
  assert.equal(getUser(request, state)?.id, user.id);
  const rotated = await call('/api/auth/login', registration, spacedCookie);
  assert.equal(rotated.status, 200);
  assert.equal(getUser(request, state), null);
  assert.equal(resolveAccountTicket(oldTicket, state), null);

  const logoutCookie = `other=value; ${rotated.cookie} ; trailing=value`;
  const freshRequest = { headers: { cookie: logoutCookie } };
  const freshTicket = issueAccountTicket(freshRequest, state, user);
  assert.equal(getUser(freshRequest, state)?.id, user.id);
  assert.equal((await call('/api/auth/logout', {}, logoutCookie)).status, 200);
  assert.equal(getUser(freshRequest, state), null);
  assert.equal(resolveAccountTicket(freshTicket, state), null);
});
