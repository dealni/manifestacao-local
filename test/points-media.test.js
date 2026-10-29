import { sessionRequest } from './session-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleMedia, getScreens } from '../src/media.js';
import { creditPoints, walletSummary } from '../src/points.js';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
function setup(t, balance = 0, production = false) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-points-media-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const user = { id: 'user', nick: 'Pessoa', verified: true };
  const state = { users: [user] },
    events = [];
  if (balance)
    creditPoints(state, user, {
      amount: balance,
      reason: 'fixture',
      reference: 'fixture',
    });
  const ctx = {
    dataDir,
    state,
    config: { production, mediaUploadUserIds: [] },
    user: () => user,
    account: () => ({ user }),
    save() {},
    broadcast: (event) => events.push(event),
    send(res, status, payload) {
      Object.assign(res, { status, payload });
    },
    body: async (req) => req.data,
    readBody: async (req) => req.data,
  };
  const request = async (route, method = 'POST', data = {}) => {
    const res = {};
    await handleMedia(
      sessionRequest(ctx, { method, headers: {}, data }),
      res,
      new URL(route, 'http://localhost'),
      ctx,
    );
    return res;
  };
  return {
    state,
    user,
    events,
    ctx,
    request,
    balance: () => walletSummary(state, user).balance,
  };
}
test('superchat exige saldo e só publica depois do débito de pontos', async (t) => {
  const { state, events, request, balance } = setup(t, 150);
  const rejected = await request('/superchat', 'POST', {
    message: 'Sem saldo suficiente',
    points: 200,
  });
  assert.equal(rejected.status, 409);
  assert.equal(balance(), 150);
  assert.equal(state.superchats.length, 0);
  assert.equal(events.length, 0);
  const result = await request('/superchat', 'POST', {
    message: 'Com pontos',
    cents: 100,
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.points, 100);
  assert.equal(result.payload.currency, 'points');
  assert.equal(result.payload.free, false);
  assert.equal(balance(), 50);
  assert.equal(events.length, 2);
  assert.equal(state.pointsLedger.at(-1).reason, 'superchat');
});
test('superchat rejeita valores arbitrários sem consumir pontos', async (t) => {
  const { request, balance, events } = setup(t, 1000);
  for (const points of [0, -100, 100.5, '100', null, Number.MAX_SAFE_INTEGER]) {
    const result = await request('/superchat', 'POST', {
      message: 'Teste',
      points,
    });
    assert.equal(result.status, 400);
  }
  assert.equal((await request('/superchat', 'POST', { message: '', points: 100 })).status, 400);
  assert.equal(balance(), 1000);
  assert.equal(events.length, 0);
});
test('cartaz cobra uma única vez e não permite ativação sem saldo', async (t) => {
  const { request, balance, state, user } = setup(t, 150);
  const upload = await request('/cartaz?tipo=cartaz', 'POST', png);
  assert.equal(upload.status, 200);
  const design = upload.payload.design;
  assert.equal(design.paid, false);
  assert.equal(balance(), 150);
  assert.equal((await request('/cartaz/comprar', 'GET')).payload.status, 'ready');
  assert.equal((await request('/cartaz/ativar', 'POST', { id: design.id })).status, 200);
  assert.equal(design.paid, true);
  assert.equal(balance(), 50);
  assert.equal((await request('/cartaz/comprar', 'POST', { id: design.id })).status, 200);
  assert.equal(balance(), 50);
  const second = (await request('/cartaz?tipo=bandeira', 'POST', png)).payload.design;
  assert.equal((await request('/cartaz/ativar', 'POST', { id: second.id })).status, 409);
  assert.equal(second.paid, false);
  assert.equal(user.design, design.id);
  assert.equal(state.pointsLedger.filter((item) => item.reason === 'design').length, 1);
});
test('pedidos inválidos e impulsos não consomem pontos nem criam anúncios', async (t) => {
  const { request, state, balance, events } = setup(t, 1000);
  for (const [body, status] of [
    [{ items: [{ screen: 'masp-principal', cents: 100 }], media: [] }, 400],
    [{ boost: 'bid', cents: 1000 }, 409],
  ]) {
    const result = await request('/telao/lance', 'POST', body);
    assert.equal(result.status, status);
  }
  assert.equal(balance(), 1000);
  assert.equal(state.mediaBids.length, 0);
  assert.equal(Object.keys(state.mediaPurchases).length, 0);
  assert.equal(events.length, 0);
  const screens = getScreens({ state });
  assert.equal(screens.currency, 'points');
  assert.equal(screens.biddingEnabled, false);
  assert.equal(screens.purchasesEnabled, true);
  assert.equal(screens.rules.pricePerScreen, 100);
  assert.equal(screens.screens.length, 65);
});
test('produção exige conta confirmada antes de enviar imagem', async (t) => {
  const { request, balance, user } = setup(t, 1000, true);
  user.verified = false;
  assert.equal((await request('/cartaz', 'POST', png)).status, 403);
  assert.equal((await request('/telao/midia', 'POST', png)).status, 403);
  assert.equal(balance(), 1000);
});
