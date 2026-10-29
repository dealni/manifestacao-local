import { sessionRequest } from './session-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleEconomy, PURCHASE_LIMITS } from '../src/economy.js';

function context(production = true) {
  const user = { id: 'person', verified: true, owned: {} };
  return {
    production,
    state: { purchases: {}, designs: [] },
    catalog: [],
    user: () => user,
    saved: 0,
    body: async (req) => req.payload,
    save() {
      this.saved++;
    },
    send(res, status, payload) {
      Object.assign(res, { status, payload });
    },
  };
}
async function buy(ctx, payload = { key: 'brasil-premium' }) {
  const res = {};
  await handleEconomy(
    sessionRequest(ctx, { method: 'POST', payload }),
    res,
    new URL('https://manifestacoes.com/api/jogos/manifestacao/bandeira'),
    ctx,
  );
  return res;
}

test('compra com pontos rejeita payload e keys arbitrárias sem aumentar estado', async () => {
  const ctx = context();
  for (const payload of [
    null,
    [],
    { key: {} },
    { key: 42 },
    { key: 'x'.repeat(1024 * 1024) },
    { key: 'inventada' },
  ]) {
    assert.equal((await buy(ctx, payload)).status, 400);
  }
  assert.deepEqual(ctx.state.purchases, {});
  assert.equal(ctx.saved, 0);
  assert.equal(ctx.user().ink, undefined);
  const result = await buy(ctx, { key: 'brasil-premium' });
  assert.equal(result.status, 200);
  assert.equal(result.payload.key, 'brasil-premium');
  assert.equal(result.payload.status, 'paid');
  assert.equal(result.payload.free, false);
});

test('produção limita cooldown e compras por hora antes de mutar benefícios', async () => {
  const ctx = context();
  assert.equal((await buy(ctx)).status, 200);
  const ink = ctx.user().ink;
  assert.equal((await buy(ctx, { key: 'mito' })).status, 429);
  assert.equal(ctx.user().ink, ink);
  assert.equal(ctx.saved, 1);
  ctx.state.purchases = Object.fromEntries(
    Array.from({ length: PURCHASE_LIMITS.perHour }, (_, i) => [
      `r${i}`,
      { userId: 'person', createdAt: new Date(Date.now() - 10000 - i * 1000).toISOString() },
    ]),
  );
  assert.equal((await buy(ctx, { key: 'mito' })).status, 429);
  assert.equal(ctx.saved, 1);
  const local = context(false);
  assert.equal((await buy(local)).status, 200);
  assert.equal((await buy(local, { key: 'mito' })).status, 200);
});

test('produção conserva referências recentes com histórico por conta e total limitados', async () => {
  const ctx = context();
  const old = new Date(Date.now() - 86400000).toISOString();
  for (let i = 0; i < 105; i++)
    ctx.state.purchases[`own-${i}`] = { userId: 'person', createdAt: old };
  for (let i = 0; i < 10010; i++)
    ctx.state.purchases[`other-${i}`] = { userId: 'other', createdAt: old };
  const result = await buy(ctx);
  assert.equal(result.status, 200);
  assert.ok(Object.keys(ctx.state.purchases).length <= PURCHASE_LIMITS.totalHistory);
  assert.ok(
    Object.values(ctx.state.purchases).filter((p) => p.userId === 'person').length <=
      PURCHASE_LIMITS.perUserHistory,
  );
  assert.equal(ctx.state.purchases[result.payload.ref].key, 'brasil-premium');
});
