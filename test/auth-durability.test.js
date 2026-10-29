import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { handleAuth } from '../src/auth.js';

function fixture() {
  const salt = 'c'.repeat(32);
  const password = 'senha-teste-segura';
  const token = 'a'.repeat(64);
  const user = {
    id: 'durable-user',
    email: 'pessoa@example.test',
    nick: 'Pessoa',
    verified: true,
    passwordHash: `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`,
  };
  const ctx = {
    state: {
      users: [user],
      sessions: { [token]: { userId: user.id, expiresAt: Date.now() + 60000 } },
    },
    save() {},
    persistence: { async flush() {} },
    body: async (req) => req.body,
    send(res, status, payload) {
      Object.assign(res, { status, payload });
    },
  };
  function call(path, body, cookie) {
    const res = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
    };
    const pending = handleAuth(
      { method: 'POST', headers: { cookie }, body },
      res,
      new URL(path, 'http://localhost'),
      ctx,
    );
    return { res, pending };
  }
  return { ctx, user, password, token, call };
}

test('login por senha só entrega sessão após confirmação da persistência', async () => {
  const f = fixture();
  let release;
  let entered;
  const flushing = new Promise((resolve) => (entered = resolve));
  f.ctx.persistence.flush = () => {
    entered();
    return new Promise((resolve) => (release = resolve));
  };
  const { res, pending } = f.call('/api/auth/login', {
    email: f.user.email,
    password: f.password,
  });
  await flushing;
  assert.equal(res.status, undefined);
  assert.equal(res.headers['Set-Cookie'], undefined);
  release();
  await pending;
  assert.equal(res.status, 200);
  assert.match(res.headers['Set-Cookie'], /^local_session=[a-f0-9]{64};/);
});

test('falha ao persistir login não entrega nem conserva a nova sessão', async () => {
  const f = fixture();
  f.ctx.persistence.flush = async () => {
    throw new Error('disco indisponível');
  };
  const { res, pending } = f.call('/api/auth/login', {
    email: f.user.email,
    password: f.password,
  });
  await pending;
  assert.equal(res.status, 503);
  assert.equal(res.headers['Set-Cookie'], undefined);
  assert.deepEqual(Object.keys(f.ctx.state.sessions), [f.token]);
});

test('apelido não confirma sucesso quando o armazenamento falha e permite repetir', async () => {
  const f = fixture();
  f.ctx.persistence.flush = async () => {
    throw new Error('disco indisponível');
  };
  const failed = f.call('/api/profile/nick', { nick: 'Novo nome' }, `local_session=${f.token}`);
  await failed.pending;
  assert.equal(failed.res.status, 503);
  f.ctx.persistence.flush = async () => {};
  const retry = f.call('/api/profile/nick', { nick: 'Novo nome' }, `local_session=${f.token}`);
  await retry.pending;
  assert.equal(retry.res.status, 200);
  assert.equal(retry.res.payload.user.nick, 'Novo nome');
});
