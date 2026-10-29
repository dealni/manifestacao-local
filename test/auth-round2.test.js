import test from 'node:test';
import assert from 'node:assert/strict';
import { getUser, handleAuth, issueAccountTicket, resolveAccountTicket } from '../src/auth.js';

function fixture(flush) {
  const token = 'a'.repeat(64);
  const otherToken = 'b'.repeat(64);
  const user = { id: 'logout-review', email: 'logout@example.test', verified: true };
  const state = {
    users: [user],
    sessions: {
      [token]: { userId: user.id, expiresAt: Date.now() + 60000 },
      [otherToken]: { userId: user.id, expiresAt: Date.now() + 60000 },
    },
  };
  const req = { method: 'POST', headers: { cookie: `local_session=${token}` } };
  const ticket = issueAccountTicket(req, state, user);
  const saves = [];
  const ctx = {
    state,
    save() {
      saves.push(structuredClone(state));
    },
    persistence: { flush },
    send(res, status, payload) {
      Object.assign(res, { status, payload });
    },
  };
  function logout() {
    const res = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
    };
    return {
      res,
      pending: handleAuth(req, res, new URL('http://localhost/api/auth/logout'), ctx),
    };
  }
  return { ctx, state, req, ticket, saves, logout, otherToken };
}

test('logout só limpa cookie e confirma sucesso após revogação durável', async () => {
  let release;
  const f = fixture(() => new Promise((resolve) => (release = resolve)));
  const { res, pending } = f.logout();
  await Promise.resolve();
  assert.equal(typeof release, 'function');
  assert.equal(getUser(f.req, f.state), null);
  assert.equal(resolveAccountTicket(f.ticket, f.state), null);
  assert.equal(res.status, undefined);
  assert.equal(res.headers['Set-Cookie'], undefined);
  assert.deepEqual(Object.keys(f.saves[0].sessions), [f.otherToken]);
  release();
  await pending;
  assert.equal(res.status, 200);
  assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
  assert.ok(f.state.sessions[f.otherToken], 'preserva a sessão de outro dispositivo');
});

test('logout com falha de armazenamento permite repetir revogação sem apagar cookie', async () => {
  const f = fixture(async () => {
    throw new Error('armazenamento indisponível');
  });
  const failed = f.logout();
  await failed.pending;
  assert.equal(failed.res.status, 503);
  assert.match(failed.res.payload.error, /Tente novamente/);
  assert.equal(failed.res.headers['Set-Cookie'], undefined);
  assert.equal(resolveAccountTicket(f.ticket, f.state), null);
  f.ctx.persistence.flush = async () => {};
  const retry = f.logout();
  await retry.pending;
  assert.equal(retry.res.status, 200);
  assert.match(retry.res.headers['Set-Cookie'], /Max-Age=0/);
  assert.equal(f.saves.length, 2);
  assert.deepEqual(Object.keys(f.saves[1].sessions), [f.otherToken]);
});
