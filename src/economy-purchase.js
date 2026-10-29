import { randomUUID } from 'node:crypto';
import { initializeWallet, debitPoints, walletSummary } from './points.js';
import { buildAccount } from './economy-account.js';
import {
  entitlements,
  localInk,
  PASS_KEYS,
  OBJECT_KEYS,
  FLAG_KEYS,
  VEHICLE_KEYS,
  catalog,
  PASS_COSTS,
  POINT_COSTS,
  unique,
} from './economy-catalog.js';
export const PURCHASE_LIMITS = Object.freeze({
  cooldownMs: 2000,
  perHour: 60,
  perUserHistory: 100,
  totalHistory: 10000,
});
const production = (ctx) => ctx.production === true || ctx.runtimeConfig?.production === true;
function purchaseTime(purchase) {
  const value = Date.parse(purchase?.createdAt);
  return Number.isFinite(value) ? value : 0;
}
function prunePurchaseHistory(purchases, userId) {
  const newest = Object.entries(purchases).sort((a, b) => purchaseTime(b[1]) - purchaseTime(a[1]));
  let own = 0,
    total = 0;
  for (const [ref, purchase] of newest) {
    const owned = String(purchase.userId) === String(userId);
    if ((owned && ++own > PURCHASE_LIMITS.perUserHistory) || ++total > PURCHASE_LIMITS.totalHistory)
      delete purchases[ref];
  }
}

export async function purchaseProduct({ ctx, user, req, requireSession, send, route }) {
  if (production(ctx) && (user.verified !== true || user.nickPending === true))
    return send(403, {
      error: 'Confirme seu e-mail e escolha um apelido para usar pontos.',
      code: 'account_not_ready',
    });
  const body = await ctx.body(req);
  requireSession();
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return send(400, { error: 'Compra inválida.' });
  const product = validatePurchaseProduct(body, route, ctx, send);
  if (product === true) return true;
  const { key } = product;
  const identity = purchaseReference(body, user, send);
  if (identity === true) return true;
  const { reference } = identity;
  if (existingPurchase({ ctx, user, req, route, key, reference, send })) return true;
  if (ownedPurchase({ ctx, user, req, route, key, send })) return true;
  if (purchaseRateLimited(ctx, user, send)) return true;
  const charged = chargePurchase({ ctx, user, req, route, key, reference, send });
  if (charged === true) return true;
  const { pointsCost } = charged;
  return fulfillPurchase({ ctx, user, req, route, key, reference, send, pointsCost });
}

function validatePurchaseProduct(body, route, ctx, send) {
  const key =
    body.key ??
    (route === 'acesso' ? 'acesso' : route === 'pvp' ? 'pvp' : route === 'tinta' ? 'tinta' : '');
  if (typeof key !== 'string' || key.length > 100)
    return send(400, { error: 'Produto local desconhecido.' });
  const allowed = {
    acesso: ['acesso'],
    pvp: ['pvp'],
    tinta: ['tinta'],
    passe: PASS_KEYS,
    objeto: OBJECT_KEYS,
    bandeira: FLAG_KEYS,
    veiculo: VEHICLE_KEYS,
    personagem: catalog(ctx).map((x) => x.key),
  };
  if (!allowed[route]?.includes(key)) return send(400, { error: 'Produto local desconhecido.' });
  if (route === 'tinta')
    return send(409, {
      error: 'A tinta já é ilimitada neste jogo. Nenhum ponto foi descontado.',
      code: 'unlimited_ink',
      currency: 'points',
      paymentsEnabled: false,
    });
  return { key };
}

function existingPurchase({ ctx, user, req, route, key, reference, send }) {
  const prior = Object.values(ctx.state.purchases ?? {}).find(
    (p) => p.userId === user.id && p.reference === reference,
  );
  if (prior) {
    if (prior.kind !== route || prior.key !== key)
      return send(409, { error: 'Identificador já usado para outro produto.' });
    return send(200, { ...prior, account: buildAccount(ctx, user, req), tinta: localInk(user) });
  }
  // A referência da carteira sobrevive à poda dos recibos. Confira o produto
  // antes do retorno para itens já adquiridos, que não passa por debitPoints.
  const durableReferences = user.pointsWallet?.references;
  const previousDebit =
    durableReferences && Object.hasOwn(durableReferences, reference)
      ? durableReferences[reference]
      : null;
  if (
    previousDebit &&
    (previousDebit.direction !== 'debit' || previousDebit.reason !== `purchase:${route}:${key}`)
  )
    return send(409, {
      error: 'Identificador já usado para outro produto.',
      code: 'idempotency_conflict',
    });
  return false;
}

function ownedPurchase({ ctx, user, req, route, key, send }) {
  const own = entitlements(ctx, user);
  const alreadyOwned =
    route === 'acesso'
      ? own.acesso
      : route === 'pvp'
        ? own.pvp
        : route === 'passe'
          ? own.passes.includes(key) || own.passes.includes('total')
          : route === 'personagem'
            ? own.personagens.includes(key)
            : route === 'objeto'
              ? own.objetos.includes(key)
              : route === 'bandeira'
                ? own.bandeiras.includes(key)
                : route === 'veiculo'
                  ? own.veiculos.includes(key)
                  : false;
  if (alreadyOwned)
    return send(200, {
      status: 'paid',
      currency: 'points',
      pointsCost: 0,
      cents: 0,
      alreadyOwned: true,
      paymentsEnabled: false,
      account: buildAccount(ctx, user, req),
      tinta: localInk(user),
    });
  return false;
}

function purchaseRateLimited(ctx, user, send) {
  if (production(ctx)) {
    const now = Date.now();
    const recent = Object.values(ctx.state.purchases ?? {}).filter(
      (purchase) =>
        String(purchase.userId) === String(user.id) && purchaseTime(purchase) > now - 3600000,
    );
    if (
      recent.some((purchase) => purchaseTime(purchase) > now - PURCHASE_LIMITS.cooldownMs) ||
      recent.length >= PURCHASE_LIMITS.perHour
    )
      return send(429, { error: 'Aguarde antes de usar pontos novamente.' });
  }
  return false;
}

function chargePurchase({ ctx, user, req, route, key, reference, send }) {
  initializeWallet(ctx.state, user);
  const pointsCost =
    route === 'passe'
      ? PASS_COSTS[key]
      : route === 'personagem'
        ? buildAccount(ctx, user, req).personagens.find((item) => item.key === key).points
        : POINT_COSTS[route];
  const debit = debitPoints(ctx.state, user, {
    amount: pointsCost,
    reason: `purchase:${route}:${key}`,
    reference,
  });
  if (!debit.ok)
    return send(debit.error === 'insufficient_points' ? 402 : 409, {
      error:
        debit.error === 'insufficient_points'
          ? 'Pontos insuficientes.'
          : 'Não foi possível concluir esta compra.',
      code: debit.error,
      wallet: walletSummary(ctx.state, user),
    });
  if (debit.duplicate)
    return send(409, {
      error: 'Esta compra já foi processada. Consulte sua conta.',
      code: 'already_processed',
      wallet: walletSummary(ctx.state, user),
    });
  return { pointsCost };
}

function fulfillPurchase({ ctx, user, req, route, key, reference, send, pointsCost }) {
  user.owned ??= {};
  const group = {
    passe: 'passes',
    objeto: 'objetos',
    bandeira: 'bandeiras',
    veiculo: 'veiculos',
    personagem: 'skins',
  }[route];
  if (group) user.owned[group] = unique(user.owned[group] ?? [], [key]);
  if (route === 'acesso') user.premium = true;
  if (route === 'pvp') {
    user.owned.pvpEnabled = true;
    user.owned.pvp = unique(user.owned.pvp ?? [], ['push']);
  }
  if (route === 'tinta')
    user.ink = Math.min(Number.MAX_SAFE_INTEGER, (Number(user.ink) || 0) + 1000);
  const ref = `local-${randomUUID()}`;
  const purchase = {
    ref,
    reference,
    userId: user.id,
    kind: route,
    key,
    status: 'paid',
    currency: 'points',
    pointsCost,
    cents: pointsCost,
    free: false,
    paymentsEnabled: false,
    local: true,
    simulation: true,
    notice: 'Status paid indica resgate com pontos, sem cobrança real.',
    createdAt: new Date().toISOString(),
  };
  (ctx.state.purchases ??= {})[ref] = purchase;
  if (production(ctx)) prunePurchaseHistory(ctx.state.purchases, user.id);
  ctx.save();
  return send(200, { ...purchase, account: buildAccount(ctx, user, req), tinta: localInk(user) });
}

function purchaseReference(body, user, send) {
  const requestKey = body.requestId ?? body.idempotencyKey;
  if (
    requestKey !== undefined &&
    (typeof requestKey !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(requestKey))
  )
    return send(400, { error: 'Identificador de compra inválido.' });
  const reference = requestKey ? `purchase:${user.id}:${requestKey}` : `purchase:${randomUUID()}`;
  return { reference };
}
