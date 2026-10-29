import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleMedia, getScreens } from '../src/media.js';
import { purchaseAd, cancelAd, AD_POINTS_RULES } from '../src/ads-points.js';
import { getPointsBalance, creditPoints } from '../src/points.js';
import { sessionRequest } from './session-fixture.js';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
const screens = JSON.parse(fs.readFileSync(new URL('../data/media-screens.json', import.meta.url)));
const screen = screens.find((s) => s.aspect === '16:9');
function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-free-media-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const user = { id: 'owner', nick: 'Pessoa', verified: true };
  const state = {
    users: [user],
    media: [{ id: 'image', userId: user.id, status: 'approved', aspect: '16:9' }],
  };
  const ctx = {
    freeAccess: true,
    dataDir,
    state,
    config: { production: false },
    user: () => user,
    account: () => ({ user }),
    save() {},
    broadcast() {},
    send(res, status, payload) {
      Object.assign(res, { status, payload });
    },
    body: async (req) => req.data,
    readBody: async (req) => req.data,
  };
  const request = async (route, method = 'POST', data = {}, session = true) => {
    const req = { method, headers: {}, data },
      res = {};
    await handleMedia(
      session ? sessionRequest(ctx, req) : req,
      res,
      new URL(route, 'http://localhost'),
      ctx,
    );
    return res;
  };
  return { ctx, user, state, request };
}
const campaign = (overrides = {}) => ({
  items: [{ screen: screen.id, points: 999999 }],
  media: ['image'],
  requestId: 'free_request_01',
  ...overrides,
});
test('modo gratuito publica e ativa design sem saldo e preserva sessão, propriedade e limite', async (t) => {
  const { user, state, request } = fixture(t);
  const uploaded = await request('/cartaz?tipo=cartaz', 'POST', png);
  assert.equal(uploaded.status, 200);
  const design = uploaded.payload.design;
  assert.equal(design.paid, true);
  assert.equal(design.free, true);
  assert.equal(design.points, 0);
  assert.equal((await request('/cartaz/comprar', 'GET')).payload.points, 0);
  assert.equal((await request('/cartaz/ativar', 'POST', { id: design.id })).status, 200);
  assert.equal(getPointsBalance(state, user), 0);
  assert.equal(state.pointsLedger, undefined);
  assert.equal((await request('/cartaz/ativar', 'POST', { id: design.id }, false)).status, 401);
  design.userId = 'other';
  assert.equal((await request('/cartaz/ativar', 'POST', { id: design.id })).status, 404);
  state.designs = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    kind: 'cartaz',
    userId: user.id,
  }));
  assert.equal((await request('/cartaz?tipo=cartaz', 'POST', png)).status, 409);
  user.verified = false;
  assert.equal((await request('/cartaz?tipo=bandeira', 'POST', png)).status, 403);
});
test('anúncio mantém cobrança de pontos mesmo com jogabilidade gratuita, 24 horas e cancelamento proporcional', (t) => {
  const { ctx, user, state } = fixture(t);
  assert.throws(() => purchaseAd(ctx, user, campaign()), { status: 400 });
  const body = campaign({ items: [{ screen: screen.id, points: 100 }] });
  assert.throws(() => purchaseAd(ctx, user, body), { status: 402 });
  creditPoints(state, user, { amount: 250, reason: 'fixture', reference: 'fixture-ad' });
  const receipt = purchaseAd(ctx, user, body);
  assert.equal(receipt.points, 100);
  assert.equal(receipt.cents, 100);
  assert.equal(receipt.bids[0].points, 100);
  assert.equal(receipt.expiresAt - receipt.createdAt, 86400000);
  assert.equal(purchaseAd(ctx, user, body).ref, receipt.ref);
  assert.equal(getPointsBalance(state, user), 150);
  assert.equal(getScreens(ctx).rules.pricePerScreen, 100);
  assert.equal(getScreens(ctx).screens[0].min, 100);
  const cancelled = cancelAd(ctx, user, { ref: receipt.ref });
  assert.ok(cancelled.refundPoints >= 99 && cancelled.refundPoints <= 100);
  assert.equal(getPointsBalance(state, user), 150 + cancelled.refundPoints);
  assert.equal(cancelAd(ctx, user, { ref: receipt.ref }).refundPoints, 0);
});
test('anúncios pagos com jogabilidade gratuita preservam conta, mídia aprovada e quotas', (t) => {
  const { ctx, user, state } = fixture(t);
  const body = campaign({ items: [{ screen: screen.id, points: 100 }] });
  assert.throws(() => purchaseAd(ctx, null, body), { status: 403 });
  state.media[0].userId = 'other';
  assert.throws(() => purchaseAd(ctx, user, body), { status: 400 });
  state.media[0].userId = user.id;
  state.media[0].status = 'review';
  assert.throws(() => purchaseAd(ctx, user, body), { status: 400 });
  state.media[0].status = 'approved';
  user.adCreationTimes = Array(AD_POINTS_RULES.purchasesPerHour).fill(Date.now());
  assert.throws(() => purchaseAd(ctx, user, body), { status: 429 });
  assert.equal(state.pointsLedger, undefined);
});
test('destaque continua cobrando pontos com jogabilidade gratuita e mantém sessão e intervalo', async (t) => {
  const { ctx, user, state, request } = fixture(t);
  assert.equal(
    (await request('/superchat', 'POST', { message: 'Teste', points: 100 }, false)).status,
    401,
  );
  assert.equal(
    (await request('/superchat', 'POST', { message: 'Sem saldo', points: 100 })).status,
    409,
  );
  creditPoints(state, user, { amount: 200, reason: 'fixture', reference: 'fixture-superchat' });
  assert.equal(
    (await request('/superchat', 'POST', { message: 'Valor inválido', points: 0 })).status,
    400,
  );
  const response = await request('/superchat', 'POST', {
    message: 'Mensagem com pontos',
    points: 100,
  });
  assert.equal(response.status, 200);
  assert.equal(response.payload.points, 100);
  assert.equal(response.payload.cents, 100);
  assert.equal(response.payload.free, false);
  assert.equal(getPointsBalance(state, user), 100);
  assert.equal(
    (await request('/superchat', 'POST', { message: 'Muito cedo', points: 100 })).status,
    429,
  );
  state.superchats = [];
  assert.equal((await request('/superchat', 'POST', { message: '', points: 100 })).status, 400);
  user.verified = false;
  assert.equal(
    (await request('/superchat', 'POST', { message: 'Sem confirmar', points: 100 })).status,
    403,
  );
  ctx.user = () => null;
  assert.equal(
    (await request('/superchat', 'POST', { message: 'Visitante', points: 100 })).status,
    401,
  );
});
