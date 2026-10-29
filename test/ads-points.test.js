import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { purchaseAd, cancelAd, pruneAdSchedule, AD_POINTS_RULES } from '../src/ads-points.js';
import { creditPoints, initializeWallet, getPointsBalance } from '../src/points.js';
const definitions = JSON.parse(
  readFileSync(new URL('../data/media-screens.json', import.meta.url), 'utf8'),
);
const screen = definitions.find((entry) => entry.aspect === '16:9');
const screen2 = definitions.find((entry) => entry.aspect === '16:9' && entry.id !== screen.id);
function fixture() {
  const user = { id: 'owner', verified: true, nick: 'Pessoa' };
  const state = {
    users: [user],
    media: [{ id: 'image', userId: user.id, aspect: '16:9', status: 'approved' }],
  };
  initializeWallet(state, user);
  let saves = 0;
  return { ctx: { state, save: () => saves++ }, user, saves: () => saves };
}
const body = (overrides = {}) => ({
  items: [{ screen: screen.id, cents: 100 }],
  media: ['image'],
  ...overrides,
});
test('campanha cobra preço fixo e cria 24 horas de rotação com recibo pago', () => {
  const { ctx, user, saves } = fixture();
  const before = Date.now();
  const receipt = purchaseAd(ctx, user, body());
  assert.equal(getPointsBalance(ctx.state, user), 200);
  assert.equal(receipt.cents, 100);
  assert.equal(receipt.paid, true);
  assert.equal(receipt.bids[0].status, 'live');
  assert.equal(receipt.bids[0].pricingMode, 'fixed');
  assert.ok(receipt.expiresAt >= before + 86400000);
  assert.equal(receipt.expiresAt - receipt.createdAt, 86400000);
  assert.equal(saves(), 1);
});
test('retry sem chave e com chave não repete cobrança; chave conflitante falha', () => {
  const { ctx, user } = fixture();
  const receipt = purchaseAd(ctx, user, body({ requestId: 'request_123' }));
  assert.equal(purchaseAd(ctx, user, body()).ref, receipt.ref);
  assert.equal(purchaseAd(ctx, user, body({ requestId: 'request_123' })).ref, receipt.ref);
  assert.throws(
    () =>
      purchaseAd(
        ctx,
        user,
        body({
          requestId: 'request_123',
          items: [{ screen: screen2.id, cents: 100 }],
        }),
      ),
    { status: 409 },
  );
  assert.equal(getPointsBalance(ctx.state, user), 200);
});
test('entrada inválida, mídia alheia ou não aprovada e saldo insuficiente não criam anúncios', () => {
  for (const override of [
    { items: [] },
    { items: [{ screen: 'unknown', cents: 100 }] },
    { items: [{ screen: screen.id, cents: 200 }] },
    { items: [{ screen: screen.id, cents: 100.5 }] },
    {
      items: [
        { screen: screen.id, cents: 100 },
        { screen: screen.id, cents: 100 },
      ],
    },
    { media: ['foreign'] },
    { boost: 'old-bid' },
    { requestId: 'x' },
  ]) {
    const { ctx, user } = fixture();
    assert.throws(() => purchaseAd(ctx, user, body(override)));
    assert.equal(getPointsBalance(ctx.state, user), 300);
    assert.equal(ctx.state.mediaBids?.length ?? 0, 0);
  }
  for (const status of ['review', 'rejected']) {
    const { ctx, user } = fixture();
    ctx.state.media[0].status = status;
    assert.throws(() => purchaseAd(ctx, user, body()), { status: 400 });
  }
  const { ctx, user } = fixture();
  user.pointsWallet.balance = 0;
  assert.throws(() => purchaseAd(ctx, user, body()), { status: 402 });
  assert.equal(ctx.state.mediaBids.length, 0);
});
test('tela exige formato correspondente e conta confirmada', () => {
  const { ctx, user } = fixture();
  const vertical = definitions.find((entry) => entry.aspect === '9:16');
  assert.throws(
    () => purchaseAd(ctx, user, body({ items: [{ screen: vertical.id, cents: 100 }] })),
    { status: 400 },
  );
  user.verified = false;
  assert.throws(() => purchaseAd(ctx, user, body()), { status: 403 });
});
test('capacidade de 50 por tela recusa pedido inteiro antes do débito', () => {
  const { ctx, user } = fixture();
  ctx.state.mediaBids = Array.from({ length: AD_POINTS_RULES.maxActivePerScreen }, (_, index) => ({
    id: String(index),
    userId: 'other',
    screen: screen.id,
    expiresAt: Date.now() + 10000,
  }));
  assert.throws(
    () =>
      purchaseAd(
        ctx,
        user,
        body({
          items: [
            { screen: screen2.id, cents: 100 },
            { screen: screen.id, cents: 100 },
          ],
        }),
      ),
    { status: 409 },
  );
  assert.equal(getPointsBalance(ctx.state, user), 300);
  assert.equal(ctx.state.mediaBids.length, 50);
});
test('cancelar devolve somente tempo restante e nunca repete crédito', () => {
  const { ctx, user } = fixture();
  const receipt = purchaseAd(ctx, user, body());
  receipt.bids[0].expiresAt = Date.now() + 12 * 3600000;
  const result = cancelAd(ctx, user, { id: receipt.bids[0].id });
  assert.ok(result.refundPoints >= 49 && result.refundPoints <= 50);
  assert.equal(receipt.bids[0].status, 'cancelled');
  const balance = getPointsBalance(ctx.state, user);
  assert.equal(cancelAd(ctx, user, { ref: receipt.ref }).refundPoints, 0);
  assert.equal(getPointsBalance(ctx.state, user), balance);
  assert.equal(receipt.status, 'cancelled');
  assert.throws(() => cancelAd(ctx, { id: 'stranger' }, { ref: receipt.ref }), {
    status: 404,
  });
});
test('cancelamento após serializar atualiza também recibo e permite nova campanha', () => {
  const fixtureResult = fixture();
  const first = purchaseAd(fixtureResult.ctx, fixtureResult.user, body());
  const state = JSON.parse(JSON.stringify(fixtureResult.ctx.state));
  const ctx = { state, save() {} },
    user = state.users[0];
  cancelAd(ctx, user, { ref: first.ref });
  assert.equal(state.mediaPurchases[first.ref].bids[0].status, 'cancelled');
  assert.equal(state.mediaPurchases[first.ref].status, 'cancelled');
  const second = purchaseAd(ctx, user, body());
  assert.notEqual(second.ref, first.ref);
});
test('pedido com dois telões é cobrado inteiro e cancelado por referência', () => {
  const { ctx, user } = fixture();
  const receipt = purchaseAd(
    ctx,
    user,
    body({
      items: [
        { screen: screen.id, cents: 100 },
        { screen: screen2.id, cents: 100 },
      ],
    }),
  );
  assert.equal(receipt.total, 200);
  assert.equal(getPointsBalance(ctx.state, user), 100);
  const result = cancelAd(ctx, user, { ref: receipt.ref });
  assert.equal(result.cancelled, 2);
  assert.ok(result.refundPoints >= 198 && result.refundPoints <= 200);
});
test('cancelamento parcial permite nova campanha completa e preserva retry da chave antiga', () => {
  const { ctx, user } = fixture();
  creditPoints(ctx.state, user, {
    amount: 200,
    reason: 'fixture',
    reference: 'partial-cancellation',
  });
  const items = [
    { screen: screen.id, cents: 100 },
    { screen: screen2.id, cents: 100 },
  ];
  const first = purchaseAd(ctx, user, body({ items, requestId: 'partial_first' }));
  cancelAd(ctx, user, { id: first.bids[0].id });
  const state = JSON.parse(JSON.stringify(ctx.state));
  const restored = { state, save() {} };
  const account = state.users[0];
  const balance = getPointsBalance(state, account);
  assert.equal(
    purchaseAd(restored, account, body({ items, requestId: 'partial_first' })).ref,
    first.ref,
  );
  assert.equal(getPointsBalance(state, account), balance);
  const next = purchaseAd(restored, account, body({ items, requestId: 'partial_next' }));
  assert.notEqual(next.ref, first.ref);
  assert.equal(next.bids.length, 2);
  assert.ok(next.bids.every((bid) => bid.status === 'live'));
  assert.equal(getPointsBalance(state, account), balance - 200);
  assert.equal(state.mediaBids.filter((bid) => bid.status === 'live').length, 3);
});
test('histórico e ledger cheios não debitam nem cancelam parcialmente', () => {
  const { ctx, user } = fixture();
  creditPoints(ctx.state, user, {
    amount: 100,
    reason: 'fixture',
    reference: 'fixture',
  });
  const receipt = purchaseAd(ctx, user, body());
  user.pointsWallet.references = Object.fromEntries(
    Array.from({ length: 10000 }, (_, i) => [String(i), {}]),
  );
  const balance = getPointsBalance(ctx.state, user);
  assert.throws(() => cancelAd(ctx, user, { ref: receipt.ref }), {
    status: 409,
  });
  assert.equal(receipt.bids[0].status, 'live');
  assert.equal(getPointsBalance(ctx.state, user), balance);
});
test('chave explícita conflitante prevalece sobre outra campanha ativa idêntica', () => {
  const { ctx, user } = fixture();
  purchaseAd(ctx, user, body({ requestId: 'first_key' }));
  purchaseAd(
    ctx,
    user,
    body({
      requestId: 'second_key',
      items: [{ screen: screen2.id, cents: 100 }],
    }),
  );
  assert.throws(() => purchaseAd(ctx, user, body({ requestId: 'second_key' })), { status: 409 });
  assert.equal(getPointsBalance(ctx.state, user), 100);
});
test('capacidade global de 300 anúncios limita fanout sem consumir pontos', () => {
  const { ctx, user } = fixture();
  assert.equal(AD_POINTS_RULES.maxActiveTotal, 300);
  ctx.state.mediaBids = Array.from({ length: AD_POINTS_RULES.maxActiveTotal }, (_, index) => ({
    id: String(index),
    userId: 'other',
    screen: `other-${index % 65}`,
    expiresAt: Date.now() + 10000,
  }));
  assert.throws(() => purchaseAd(ctx, user, body()), { status: 429 });
  assert.equal(getPointsBalance(ctx.state, user), 300);
  assert.equal(ctx.state.mediaBids.length, 300);
});

test('chave deduplicada por conteúdo permanece vinculada após reiniciar e cancelar', () => {
  const { ctx, user } = fixture();
  const first = purchaseAd(ctx, user, body());
  const retry = purchaseAd(ctx, user, body({ requestId: 'retry_alias' }));
  assert.equal(retry.ref, first.ref);
  const state = JSON.parse(JSON.stringify(ctx.state));
  const restored = { state, save() {} };
  const account = state.users[0];
  cancelAd(restored, account, { ref: first.ref });
  const balance = getPointsBalance(state, account);
  assert.equal(purchaseAd(restored, account, body({ requestId: 'retry_alias' })).ref, first.ref);
  assert.throws(
    () =>
      purchaseAd(
        restored,
        account,
        body({
          requestId: 'retry_alias',
          items: [{ screen: screen2.id, cents: 100 }],
        }),
      ),
    { status: 409 },
  );
  assert.equal(getPointsBalance(state, account), balance);
  assert.equal(state.mediaBids.length, 1);
});

test('aliases de retry têm limite sem nova cobrança', () => {
  const { ctx, user } = fixture();
  const first = purchaseAd(ctx, user, body());
  for (let i = 0; i < 100; i++) purchaseAd(ctx, user, body({ requestId: `request_${i}` }));
  assert.throws(() => purchaseAd(ctx, user, body({ requestId: 'request_extra' })), { status: 429 });
  assert.equal(first.requestKeys.length, 100);
  assert.equal(getPointsBalance(ctx.state, user), 200);
  assert.equal(ctx.state.mediaBids.length, 1);
});

test('histórico global cheio não impede outra conta de anunciar', () => {
  const { ctx, user } = fixture();
  ctx.state.mediaPurchases = Object.fromEntries(
    Array.from({ length: 10000 }, (_, i) => [
      `old-${i}`,
      { ref: `old-${i}`, userId: 'other', status: 'cancelled', expiresAt: 1, createdAt: 1 },
    ]),
  );
  const receipt = purchaseAd(ctx, user, body());
  assert.equal(receipt.userId, user.id);
  assert.equal(getPointsBalance(ctx.state, user), 200);
  assert.ok(ctx.state.mediaPurchases['old-0'], 'não apaga histórico alheio');
});

test('retenção por conta preserva chaves primárias e aliases após serializar', () => {
  const { ctx, user } = fixture();
  const oldest = purchaseAd(ctx, user, body({ requestId: 'original_key' }));
  purchaseAd(ctx, user, body({ requestId: 'alias_key_1' }));
  cancelAd(ctx, user, { ref: oldest.ref });
  for (let i = 1; i < AD_POINTS_RULES.historyPerAccount; i++) {
    ctx.state.mediaPurchases[`old-${i}`] = {
      ref: `old-${i}`,
      userId: user.id,
      status: 'cancelled',
      expiresAt: 1,
      createdAt: oldest.createdAt + i,
    };
  }
  oldest.createdAt = 0;
  purchaseAd(ctx, user, body({ requestId: 'second_key' }));
  assert.equal(Object.keys(ctx.state.mediaPurchases).length, AD_POINTS_RULES.historyPerAccount);
  assert.equal(ctx.state.mediaPurchases[oldest.ref], undefined);
  const state = JSON.parse(JSON.stringify(ctx.state)),
    restored = { state, save() {} };
  const balance = getPointsBalance(state, state.users[0]);
  for (const requestId of ['original_key', 'alias_key_1']) {
    assert.throws(() => purchaseAd(restored, state.users[0], body({ requestId })), { status: 409 });
    assert.throws(
      () =>
        purchaseAd(
          restored,
          state.users[0],
          body({ requestId, items: [{ screen: screen2.id, cents: 100 }] }),
        ),
      { status: 409 },
    );
  }
  assert.equal(getPointsBalance(state, state.users[0]), balance);
});

test('cancelamento e restart não renovam a cota horária, mas retries não a consomem', () => {
  const original = Date.now;
  let clock = 1700000000000;
  Date.now = () => clock;
  try {
    const { ctx, user } = fixture();
    let last;
    for (let i = 0; i < AD_POINTS_RULES.purchasesPerHour; i++) {
      last = purchaseAd(ctx, user, body({ requestId: `hour_key_${i}` }));
      assert.equal(purchaseAd(ctx, user, body({ requestId: `hour_key_${i}` })).ref, last.ref);
      clock++;
      cancelAd(ctx, user, { ref: last.ref });
    }
    const state = JSON.parse(JSON.stringify(ctx.state)),
      restored = { state, save() {} },
      account = state.users[0];
    const balance = getPointsBalance(state, account);
    assert.throws(() => purchaseAd(restored, account, body({ requestId: 'hour_overflow' })), {
      status: 429,
    });
    assert.equal(getPointsBalance(state, account), balance);
    assert.equal(
      purchaseAd(
        restored,
        account,
        body({ requestId: `hour_key_${AD_POINTS_RULES.purchasesPerHour - 1}` }),
      ).ref,
      last.ref,
    );
    clock += 3600000;
    assert.ok(purchaseAd(restored, account, body({ requestId: 'next_hour_key' })).ref);
  } finally {
    Date.now = original;
  }
});

test('programação histórica é limitada sem remover campanhas ativas ou recibos', () => {
  const now = Date.now();
  const active = { id: 'active', expiresAt: now + 1 };
  const expired = Array.from({ length: 10001 }, (_, index) => ({
    id: `expired-${index}`,
    expiresAt: now - 1,
  }));
  const receipt = { ref: 'retained', bids: [expired[0]] };
  const state = {
    mediaBids: [active, ...expired, { id: 'ancient', expiresAt: now - 7 * 86400000 }],
    mediaPurchases: { retained: receipt },
  };
  assert.equal(pruneAdSchedule(state, now), true);
  assert.equal(state.mediaBids.length, 10001);
  assert.equal(state.mediaBids[0], active);
  assert.equal(state.mediaBids[1].id, 'expired-1');
  assert.equal(state.mediaPurchases.retained, receipt);
  assert.equal(receipt.bids[0], expired[0]);
  assert.equal(pruneAdSchedule(state, now), false);
});
