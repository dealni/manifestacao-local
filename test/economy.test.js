import { sessionRequest } from './session-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAccount, handleEconomy, BASIC_FLAG_KEYS } from '../src/economy.js';
const makeCtx = () => {
  const user = { id: 'one', email: 'local@example.test', nick: 'Local', verified: true, owned: {} };
  return {
    state: { users: [user], designs: [], purchases: {} },
    catalog: [{ key: 'avatar', name: 'Avatar', cents: 3000 }],
    saved: 0,
    user: () => user,
    body: async (req) => req.payload ?? {},
    save() {
      this.saved++;
    },
    send(res, status, payload) {
      Object.assign(res, { status, payload });
    },
  };
};
const call = async (ctx, path, method = 'GET', payload) => {
  const res = {};
  assert.equal(
    await handleEconomy(
      sessionRequest(ctx, { method, payload }),
      res,
      new URL(`http://localhost/api/jogos/manifestacao/${path}`),
      ctx,
    ),
    true,
  );
  return res;
};
test('anonymous account contains priced catalogue without identity', () => {
  const ctx = makeCtx(),
    a = buildAccount(ctx, null);
  assert.equal(a.user, null);
  assert.equal(a.ticket, null);
  assert.equal(a.personagens[0].cents, 300);
  assert.equal(a.personagens[0].originalCents, 3000);
});
test('account exposes only owned entitlements and its designs without password hash', () => {
  const ctx = makeCtx();
  ctx.state.designs = [
    { id: 'mine', owner: 'one' },
    { id: 'other', userId: 'two' },
  ];
  ctx.state.users[0].passwordHash = 'SECRET';
  const a = buildAccount(ctx, ctx.user());
  assert.equal(a.user.acesso.active, false);
  assert.equal(a.user.acesso.posters.remaining, 19);
  assert.deepEqual(
    a.user.cartazes.map((x) => x.id),
    ['mine'],
  );
  assert.deepEqual(a.user.bandeiras, BASIC_FLAG_KEYS);
  assert.deepEqual(a.user.pvpItems, ['push']);
  assert.equal(a.user.passwordHash, undefined);
  assert.equal(a.user.tinta.unlimited, true);
});
test('point purchases persist, reject unknown keys, and enforce ownership on poll', async () => {
  const ctx = makeCtx(),
    buy = await call(ctx, 'personagem', 'POST', { key: 'avatar' });
  assert.equal(buy.status, 200);
  assert.equal(buy.payload.status, 'paid');
  assert.equal(buy.payload.pointsCost, 300);
  assert.equal(buy.payload.account.wallet.balance, 0);
  assert.deepEqual(ctx.user().owned.skins, ['avatar']);
  assert.equal(ctx.saved, 1);
  assert.equal((await call(ctx, `personagem?ref=${buy.payload.ref}`)).status, 200);
  ctx.user = () => ({ id: 'two' });
  assert.equal((await call(ctx, `personagem?ref=${buy.payload.ref}`)).status, 404);
  assert.equal((await call(ctx, 'personagem', 'POST', { key: 'inventado' })).status, 400);
});
test('visual and catalogue filters match public client contract', async () => {
  const ctx = makeCtx();
  const visual = await call(ctx, 'visual', 'POST', {
    team: 2,
    character: 4,
    shirt: 1,
    appearance: 3,
    passwordHash: 'no',
  });
  assert.deepEqual(visual.payload.account.user.visual, {
    team: 2,
    character: 4,
    shirt: 1,
    appearance: 3,
  });
  assert.equal((await call(ctx, 'loja?q=avatar&limit=1')).payload.total, 1);
  assert.equal((await call(ctx, 'loja?q=absent')).payload.total, 0);
});
test('unrelated routes do not consume request body and purchases require local account', async () => {
  const ctx = makeCtx();
  ctx.body = () => {
    throw Error('should not consume');
  };
  assert.equal(
    await handleEconomy(
      { method: 'POST' },
      {},
      new URL('http://localhost/api/jogos/manifestacao/cartaz'),
      ctx,
    ),
    false,
  );
  ctx.user = () => null;
  assert.equal((await call(ctx, 'tinta', 'POST', {})).status, 401);
});

test('superchat configuration renders without TTS and agrees with nominal local limits', () => {
  const config = buildAccount(makeCtx(), null).superchat;
  assert.deepEqual([...config.voices], []);
  assert.equal(config.min, 100);
  assert.equal(config.max, 100000);
  assert.equal(config.maxChars, 400);
  assert.ok(config.suggested.length > 0);
  assert.ok(
    config.suggested.every(
      (cents) => Number.isSafeInteger(cents) && cents >= config.min && cents <= config.max,
    ),
  );
});
test('account tickets are delegated to session issuer with the current request', async () => {
  const ctx = makeCtx();
  const requests = [];
  ctx.issueAccountTicket = (user, req) => {
    requests.push(req);
    return req?.sessionFixture === 'valid' ? 'opaque-session-ticket' : null;
  };
  assert.equal(buildAccount(ctx, ctx.user()).ticket, null);
  const req = { method: 'GET', sessionFixture: 'valid' },
    res = {};
  await handleEconomy(req, res, new URL('http://localhost/api/jogos/manifestacao/conta'), ctx);
  assert.equal(res.payload.ticket, 'opaque-session-ticket');
  assert.equal(requests.at(-1), req);
  delete ctx.issueAccountTicket;
  assert.equal(buildAccount(ctx, ctx.user()).ticket, null);
});
test('catalogue skins and approved owned design IDs persist and can be cleared', async () => {
  const ctx = makeCtx();
  ctx.catalog = JSON.parse(
    fs.readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'),
  );
  const skin = ctx.catalog.items[0].key;
  ctx.user().owned.skins = [skin];
  ctx.state.designs = [
    { id: 'owned-poster', userId: 'one', paid: true, status: 'approved', kind: 'cartaz' },
  ];
  const expected = { team: 0, character: 0, shirt: 0, appearance: 1, skin, design: 'owned-poster' };
  const saved = await call(ctx, 'visual', 'POST', expected);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.payload.visual, expected);
  assert.deepEqual((await call(ctx, 'conta')).payload.user.visual, expected);
  // A fresh context represents state restored from JSON, independent of browser storage.
  const restored = makeCtx();
  restored.state = JSON.parse(JSON.stringify(ctx.state));
  restored.user = () => restored.state.users[0];
  assert.deepEqual(buildAccount(restored, restored.user()).user.visual, expected);
  const cleared = await call(ctx, 'visual', 'POST', {
    team: 0,
    character: 0,
    skin: null,
    design: null,
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.payload.visual.skin, null);
  assert.equal(cleared.payload.visual.design, null);
  const empty = await call(ctx, 'visual', 'POST', { skin: '', design: '' });
  assert.deepEqual(empty.payload.visual, { skin: null, design: null });
});
test('limpar ou omitir design não preserva a bandeira personalizada do visual anterior', async () => {
  const ctx = makeCtx();
  const appearance = (14 << 12) | (1 << 19) | 7;
  ctx.state.designs = [
    { id: 'poster', userId: 'one', paid: true, status: 'approved', kind: 'cartaz' },
  ];
  for (const design of [null, '', undefined]) {
    ctx.user().visual = { appearance, design: 'poster' };
    const result = await call(ctx, 'visual', 'POST', {
      appearance,
      ...(design === undefined ? {} : { design }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.payload.visual.appearance, 7);
    assert.equal(ctx.user().visual.design ?? null, null);
  }
});

test('invalid skins and unauthorized or unavailable designs cannot replace saved visual', async () => {
  const ctx = makeCtx();
  ctx.user().visual = { skin: 'avatar' };
  ctx.state.designs = [
    { id: 'foreign', userId: 'two', paid: true, status: 'approved' },
    { id: 'unpaid', userId: 'one', paid: false, status: 'approved' },
    { id: 'rejected', userId: 'one', paid: true, status: 'rejected' },
  ];
  for (const body of [
    { skin: 'inventado' },
    { skin: {} },
    { design: 'missing' },
    { design: 'foreign' },
    { design: 'unpaid' },
    { design: 'rejected' },
    { design: { id: 'foreign' } },
    [],
  ]) {
    assert.equal((await call(ctx, 'visual', 'POST', body)).status, 400);
    assert.deepEqual(ctx.user().visual, { skin: 'avatar' });
  }
  assert.equal(ctx.saved, 0);
});

test('owned purchases do not debit twice; unavailable skins cannot be selected', async () => {
  const ctx = makeCtx();
  assert.equal((await call(ctx, 'visual', 'POST', { skin: 'avatar' })).status, 400);
  const first = await call(ctx, 'personagem', 'POST', { key: 'avatar' });
  const second = await call(ctx, 'personagem', 'POST', { key: 'avatar' });
  assert.equal(first.payload.wallet, undefined);
  assert.equal(first.payload.account.wallet.balance, 0);
  assert.equal(second.status, 200);
  assert.equal(second.payload.alreadyOwned, true);
  assert.equal(second.payload.account.wallet.balance, 0);
  assert.equal((await call(ctx, 'visual', 'POST', { skin: 'avatar' })).status, 200);
});
test('insufficient points never grants benefits and existing premium remains', async () => {
  const ctx = makeCtx();
  const denied = await call(ctx, 'acesso', 'POST', {});
  assert.equal(denied.status, 402);
  assert.equal(ctx.user().premium, undefined);
  assert.equal(denied.payload.wallet.balance, 300);
  ctx.user().premium = true;
  assert.equal(buildAccount(ctx, ctx.user()).user.acesso.active, true);
  assert.equal((await call(ctx, 'acesso', 'POST', {})).payload.alreadyOwned, true);
});
test('passes unlock their item groups and owned-only store filters accurately', async () => {
  const ctx = makeCtx();
  assert.equal((await call(ctx, 'loja?owned=1')).payload.total, 0);
  ctx.user().owned = { passes: ['total'], bandeiras: ['brasil'] };
  const account = buildAccount(ctx, ctx.user());
  assert.deepEqual(account.user.personagens, ['avatar']);
  assert.equal(account.user.veiculos.length, 13);
  assert.deepEqual(account.user.bandeiras, BASIC_FLAG_KEYS);
  assert.equal((await call(ctx, 'loja?owned=1')).payload.total, 1);
  assert.equal(
    (await call(ctx, 'personagem', 'POST', { key: 'avatar' })).payload.alreadyOwned,
    true,
  );
});
test('filtro de personagens adquiridos calcula permissões uma vez por consulta', async () => {
  const ctx = makeCtx();
  ctx.catalog = Array.from({ length: 100 }, (_, i) => ({ key: `avatar-${i}`, cents: 3000 }));
  let reads = 0;
  Object.defineProperty(ctx.user().owned, 'skins', {
    get() {
      reads++;
      return ['avatar-3', 'avatar-72'];
    },
  });
  const result = await call(ctx, 'loja?owned=1');
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.payload.items.map((item) => item.key),
    ['avatar-3', 'avatar-72'],
  );
  // buildAccount monta o resumo da conta; o filtro consulta as permissões só mais uma vez.
  assert.equal(reads, 2);
  ctx.user = () => null;
  assert.equal((await call(ctx, 'loja?owned=1')).payload.total, 0);
  ctx.freeAccess = true;
  const free = await call(ctx, 'loja?owned=1&offset=90');
  assert.equal(free.payload.total, 100);
  assert.equal(free.payload.items.length, 10);
});
test('idempotency deduplicates retries and remains safe after receipt pruning', async () => {
  const ctx = makeCtx();
  const body = { key: 'brasil-premium', requestId: 'purchase_123' };
  const first = await call(ctx, 'bandeira', 'POST', body),
    repeat = await call(ctx, 'bandeira', 'POST', body);
  assert.equal(first.status, 200);
  assert.equal(repeat.payload.ref, first.payload.ref);
  assert.deepEqual(ctx.user().owned.bandeiras, ['brasil-premium']);
  assert.equal(repeat.payload.account.wallet.balance, 250);
  ctx.state.purchases = {};
  const pruned = await call(ctx, 'bandeira', 'POST', body);
  assert.equal(pruned.status, 200);
  assert.equal(pruned.payload.alreadyOwned, true);
  assert.equal(pruned.payload.account.wallet.balance, 250);
  assert.equal(
    (await call(ctx, 'bandeira', 'POST', { key: 'brasil-premium', requestId: 'short' })).status,
    400,
  );
});
test('chave de recibo podado rejeita outro produto mesmo quando já adquirido', async () => {
  const ctx = makeCtx();
  const requestId = 'durable_purchase';
  const first = await call(ctx, 'bandeira', 'POST', { key: 'brasil-premium', requestId });
  assert.equal(first.status, 200);
  ctx.state.purchases = {};
  const restored = JSON.parse(JSON.stringify(ctx.state));
  ctx.state = restored;
  ctx.user = () => restored.users[0];
  const balance = ctx.user().pointsWallet.balance;
  const conflict = await call(ctx, 'bandeira', 'POST', { key: 'brasil', requestId });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.payload.code, 'idempotency_conflict');
  assert.equal(ctx.user().pointsWallet.balance, balance);
  const repeat = await call(ctx, 'bandeira', 'POST', { key: 'brasil-premium', requestId });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.payload.alreadyOwned, true);
  assert.equal(ctx.user().pointsWallet.balance, balance);
});

test('server defines point prices and ignores client supplied amounts', async () => {
  const ctx = makeCtx();
  ctx.catalog.push({ key: 'special', cents: 10000 });
  const account = buildAccount(ctx, ctx.user());
  assert.equal(account.currency, 'points');
  assert.equal(account.paymentsEnabled, false);
  assert.equal(account.acesso.points, 500);
  assert.equal(account.passes.find((p) => p.key === 'total').points, 1000);
  assert.equal(account.personagens.find((p) => p.key === 'special').points, 500);
  assert.equal(account.veiculos[0].points, 150);
  assert.equal(account.objetos.find((i) => i.key === 'foam').points, 50);
  assert.equal(account.objetos[0].points, 0);
  assert.equal(account.tinta.points, 25);
  const buy = await call(ctx, 'bandeira', 'POST', {
    key: 'brasil-premium',
    amount: -999,
    pointsCost: 0,
    cents: 0,
  });
  assert.equal(buy.payload.pointsCost, 50);
  assert.equal(buy.payload.account.wallet.balance, 250);
  const ink = await call(ctx, 'tinta', 'POST', {});
  assert.equal(ink.status, 409);
  assert.equal(account.tinta.enabled, false);
  assert.equal(buildAccount(ctx, ctx.user()).wallet.balance, 250);
});
test('basic flags are free and paid appearances cannot bypass ownership', async () => {
  const ctx = makeCtx(),
    account = buildAccount(ctx, ctx.user());
  assert.equal(account.bandeiras.find((i) => i.key === 'brasil').points, 0);
  const basic = await call(ctx, 'bandeira', 'POST', { key: 'brasil' });
  assert.equal(basic.payload.alreadyOwned, true);
  assert.equal(basic.payload.account.wallet.balance, 300);
  assert.equal((await call(ctx, 'visual', 'POST', { character: 12 })).status, 400);
  const paidFlag = await call(ctx, 'visual', 'POST', { appearance: 4 << 12 });
  assert.equal(paidFlag.payload.visual.appearance, 0);
  await call(ctx, 'bandeira', 'POST', { key: 'brasil-premium' });
  assert.equal(
    (await call(ctx, 'visual', 'POST', { appearance: 4 << 12 })).payload.visual.appearance,
    4 << 12,
  );
});

test('total pass prevents redundant charges for narrower passes', async () => {
  const ctx = makeCtx();
  ctx.user().owned.passes = ['total'];
  const before = buildAccount(ctx, ctx.user()).wallet.balance;
  for (const key of ['garagem', 'personagens', 'total']) {
    const result = await call(ctx, 'passe', 'POST', { key });
    assert.equal(result.status, 200);
    assert.equal(result.payload.alreadyOwned, true);
    assert.equal(result.payload.account.wallet.balance, before);
  }
  assert.equal(ctx.saved, 0);
  assert.equal(Object.keys(ctx.state.purchases).length, 0);
  assert.equal(ctx.state.pointsLedger.filter((entry) => entry.direction === 'debit').length, 0);
});
test('production points purchases require verified completed accounts before consuming body or balance', async () => {
  for (const state of [{ verified: false }, { verified: true, nickPending: true }]) {
    const ctx = makeCtx();
    ctx.production = true;
    Object.assign(ctx.user(), state);
    ctx.user().pointsWallet = { version: 1, balance: 1000, initialized: true, references: {} };
    ctx.body = () => {
      throw Error('ineligible purchase must not read body');
    };
    const result = await call(ctx, 'bandeira', 'POST', { key: 'brasil-premium' });
    assert.equal(result.status, 403);
    assert.equal(result.payload.code, 'account_not_ready');
    assert.equal(ctx.user().pointsWallet.balance, 1000);
    assert.equal(ctx.saved, 0);
    assert.deepEqual(ctx.user().owned, {});
    assert.equal(ctx.state.pointsLedger, undefined);
  }
});
