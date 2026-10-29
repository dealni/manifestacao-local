import { sessionRequest } from './session-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleMedia } from '../src/media.js';
import { buildAccount } from '../src/economy.js';
import { sanitizeAppearance } from '../src/game-permissions.js';
import { initializeWallet, walletSummary } from '../src/points.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
function fixture(t, free = true) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-design-reward-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const user = { id: 'u', nick: 'Teste', verified: true, owned: { designsFree: free } };
  let saves = 0;
  const ctx = {
    dataDir,
    state: { users: [user] },
    user: () => user,
    account: () => buildAccount(ctx, user),
    save() {
      saves++;
    },
    send(res, status, payload) {
      Object.assign(res, { status, payload });
    },
    readBody: async (req) => req.data,
    body: async (req) => JSON.parse(req.data),
  };
  initializeWallet(ctx.state, user);
  const balance = () => walletSummary(ctx.state, user).balance;
  async function request(route, method = 'GET', body = {}) {
    const res = {};
    await handleMedia(
      sessionRequest(ctx, {
        method,
        headers: {},
        data: Buffer.isBuffer(body) ? body : JSON.stringify(body),
      }),
      res,
      new URL('http://localhost/api/jogos/manifestacao' + route),
      ctx,
    );
    return res;
  }
  return { ctx, user, request, balance, saves: () => saves };
}
for (const [kind, flag] of [
  ['cartaz', 30],
  ['bandeira', 31],
]) {
  test(`recompensa cria e ativa ${kind} aprovado sem debitar e permite equipar`, async (t) => {
    const f = fixture(t),
      before = f.balance();
    const upload = await f.request(`/cartaz?tipo=${kind}`, 'POST', png);
    assert.equal(upload.status, 200);
    const d = upload.payload.design;
    assert.equal(d.paid, true);
    assert.equal(d.free, true);
    assert.equal(d.included, true);
    assert.equal(d.points, 0);
    assert.equal(d.cents, 0);
    assert.equal(d.status, 'approved');
    for (const route of ['/cartaz/ativar', '/cartaz/comprar', '/cartaz/ativar']) {
      const res = await f.request(route, 'POST', { id: d.id });
      assert.equal(res.status, 200);
      assert.equal(res.payload.free, true);
      assert.equal(res.payload.points, 0);
      assert.equal(res.payload.cents, 0);
      assert.equal(res.payload.account.user.designsFree, true);
    }
    assert.equal(f.user.design, d.id);
    const appearance = ((flag & 15) << 12) | ((flag >> 4) << 19) | 5;
    assert.equal(
      sanitizeAppearance({ userId: f.user.id, design: d.id }, f.ctx, appearance),
      appearance,
    );
    assert.equal(f.balance(), before);
    assert.equal(f.ctx.state.pointsLedger.filter((x) => x.reason === 'design').length, 0);
    const restored = JSON.parse(JSON.stringify(f.ctx.state));
    assert.equal(restored.users[0].owned.designsFree, true);
    assert.equal(restored.designs[0].paid, true);
    assert.equal(restored.designs[0].points, 0);
  });
}
test('design anterior pendente de resgate recebe gratuidade após missão sem devolver compras anteriores', async (t) => {
  const f = fixture(t, false);
  const old = (await f.request('/cartaz?tipo=cartaz', 'POST', png)).payload.design;
  const purchased = (await f.request('/cartaz?tipo=bandeira', 'POST', png)).payload.design;
  await f.request('/cartaz/comprar', 'POST', { id: purchased.id });
  assert.equal(purchased.points, 100);
  const before = f.balance();
  f.user.owned.designsFree = true;
  const res = await f.request('/cartaz/comprar', 'POST', { id: old.id });
  assert.equal(res.status, 200);
  assert.equal(old.paid, true);
  assert.equal(old.free, true);
  assert.equal(old.points, 0);
  assert.equal(f.balance(), before);
  await f.request('/cartaz/ativar', 'POST', { id: purchased.id });
  assert.equal(purchased.points, 100);
  assert.equal(purchased.free, false);
  assert.equal(f.balance(), before);
  const quote = await f.request('/cartaz/comprar');
  assert.equal(quote.payload.points, 0);
  assert.equal(quote.payload.free, true);
});
test('benefício mantém aprovação, autoria, saneamento de upload e limites por tipo', async (t) => {
  const f = fixture(t);
  assert.equal(
    (await f.request('/cartaz?tipo=cartaz', 'POST', Buffer.from('<svg>bad</svg>'))).status,
    400,
  );
  const d = (await f.request('/cartaz?tipo=cartaz', 'POST', png)).payload.design;
  d.paid = false;
  d.status = 'review';
  assert.equal((await f.request('/cartaz/comprar', 'POST', { id: d.id })).status, 403);
  d.status = 'approved';
  d.userId = 'another';
  assert.equal((await f.request('/cartaz/comprar', 'POST', { id: d.id })).status, 404);
  f.ctx.state.designs = Array.from({ length: 20 }, (_, i) => ({
    id: `c${i}`,
    userId: f.user.id,
    kind: 'cartaz',
  }));
  assert.equal((await f.request('/cartaz?tipo=cartaz', 'POST', png)).status, 409);
  assert.equal((await f.request('/cartaz?tipo=bandeira', 'POST', png)).status, 200);
});
test('quem não concluiu missão continua usando pontos, inclusive conta Premium sem a recompensa', async (t) => {
  const f = fixture(t, false);
  f.user.premium = true;
  const before = f.balance();
  const d = (await f.request('/cartaz?tipo=cartaz', 'POST', png)).payload.design;
  assert.equal(d.free, false);
  assert.equal(d.points, 100);
  await f.request('/cartaz/comprar', 'POST', { id: d.id });
  assert.equal(f.balance(), before - 100);
  assert.equal((await f.request('/cartaz/comprar')).payload.points, 100);
});
