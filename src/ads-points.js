import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { creditPoints, debitPoints, getPointsBalance, POINTS_RULES } from './points.js';

const screens = JSON.parse(
  readFileSync(new URL('../data/media-screens.json', import.meta.url), 'utf8'),
);
const screenById = new Map(screens.map((screen) => [screen.id, screen]));
export const AD_POINTS_RULES = Object.freeze({
  pricePerScreen: 100,
  durationSeconds: 86400,
  currency: 'points',
  pricingMode: 'fixed',
  biddingEnabled: false,
  boostEnabled: false,
  maxActivePerAccount: 100,
  maxActiveTotal: 300,
  maxActivePerScreen: 50,
  historyPerAccount: 200,
  purchasesPerHour: 20,
  requestKeysPerAccount: 10000,
});
const error = (status, message) => Object.assign(new Error(message), { status });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const id = () => randomBytes(12).toString('hex');

// A programação é transitória; os recibos e as chaves de idempotência permanecem
// nos seus próprios históricos, mesmo depois de remover uma entrada expirada.
export function pruneAdSchedule(state, now = Date.now()) {
  const bids = state.mediaBids ?? [];
  const retained = [
    ...bids.filter((bid) => bid.expiresAt > now),
    ...bids
      .filter((bid) => bid.expiresAt <= now && bid.expiresAt > now - 7 * 86400000)
      .slice(-10000),
  ];
  if (retained.length === bids.length) return false;
  state.mediaBids = retained;
  return true;
}

function requestHistory(user, purchases) {
  const keys = { ...user.adRequestKeys };
  for (const receipt of purchases) {
    for (const key of [receipt.requestKey, ...(receipt.requestKeys ?? [])]) {
      if (key) keys[key] = { ref: receipt.ref, fingerprint: receipt.campaignFingerprint };
    }
  }
  if (Object.keys(keys).length > AD_POINTS_RULES.requestKeysPerAccount)
    throw error(429, 'Limite de chaves de anúncios desta conta atingido. Fale com o suporte.');
  return keys;
}

function selectScreens(user, body) {
  if (!user?.id || user.verified !== true || user.nickPending === true)
    throw error(403, 'Confirme seu e-mail e escolha um apelido para anunciar.');
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw error(400, 'Pedido de anúncio inválido.');
  if (body.boost != null)
    throw error(409, 'Os anúncios usam preço fixo e rotação. Não é necessário impulsionar.');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > screens.length)
    throw error(400, 'Escolha de 1 a 65 telões.');
  if (!Array.isArray(body.media) || body.media.length < 1 || body.media.length > 2)
    throw error(400, 'Escolha a mídia do anúncio.');
  const selected = body.items.map((item) => {
    const screen = screenById.get(item?.screen);
    if (
      !screen ||
      !Number.isSafeInteger(item?.points ?? item?.cents) ||
      (item.points ?? item.cents) !== AD_POINTS_RULES.pricePerScreen
    )
      throw error(400, 'Cada telão custa 100 pontos por 24 horas. Atualize o pedido.');
    return screen;
  });
  if (new Set(selected.map((screen) => screen.id)).size !== selected.length)
    throw error(400, 'Cada telão deve aparecer uma única vez no pedido.');
  return selected;
}

function selectPlacements(state, user, body, selected) {
  const media = body.media.map((mediaId) => {
    const record = state.media.find((entry) => entry.id === mediaId && entry.userId === user.id);
    if (!record || record.status !== 'approved')
      throw error(400, 'Use somente mídias aprovadas da sua conta.');
    return record;
  });
  const placements = selected
    .map((screen) => {
      const content = media.find((entry) => entry.aspect === screen.aspect);
      if (!content) throw error(400, 'A mídia precisa ter o mesmo formato do telão escolhido.');
      return { screen: screen.id, media: content.id };
    })
    .sort((a, b) => a.screen.localeCompare(b.screen));
  return placements;
}

function requestKeyFor(body, user) {
  const requestId = body.requestId;
  if (
    requestId != null &&
    (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(requestId))
  )
    throw error(400, 'Identificador do pedido inválido.');
  const requestKey = requestId == null ? null : hash(`${user.id}:${requestId}`);
  return requestKey;
}

function previousPurchase(ownPurchases, user, requestKey, keys, fingerprint, now, placements) {
  const keyed =
    requestKey &&
    ownPurchases.find(
      (entry) =>
        entry.userId === user.id &&
        (entry.requestKey === requestKey || entry.requestKeys?.includes(requestKey)),
    );
  if (requestKey && !keyed && Object.hasOwn(keys, requestKey))
    throw error(
      409,
      'Este pedido já foi processado e seu recibo foi arquivado. Use uma nova chave para outra campanha.',
    );
  const previous =
    keyed ||
    ownPurchases.find(
      (entry) =>
        entry.userId === user.id &&
        entry.campaignFingerprint === fingerprint &&
        entry.status !== 'cancelled' &&
        entry.expiresAt > now &&
        entry.bids?.length === placements.length &&
        entry.bids.every((bid) => bid.status !== 'cancelled' && bid.expiresAt > now),
    );
  return { keyed, previous };
}

function reusePurchase(ctx, user, previous, fingerprint, requestKey, keyed, keys) {
  if (previous.campaignFingerprint !== fingerprint)
    throw error(409, 'Este identificador já foi usado em outro pedido.');
  // A deduplicação por conteúdo também consome a chave recebida. Sem registrá-la,
  // um retry posterior com outra campanha poderia debitar usando a mesma chave.
  if (requestKey && !keyed) {
    const retryKeys = previous.requestKeys ?? [];
    if (retryKeys.length >= 100) throw error(429, 'Limite de tentativas deste pedido atingido.');
    if (
      !Object.hasOwn(keys, requestKey) &&
      Object.keys(keys).length >= AD_POINTS_RULES.requestKeysPerAccount
    )
      throw error(429, 'Limite de chaves de anúncios desta conta atingido.');
    previous.requestKeys = [...retryKeys, requestKey];
    keys[requestKey] = { ref: previous.ref, fingerprint };
    user.adRequestKeys = keys;
    ctx.save();
  }
  return previous;
}

function checkCapacity(state, user, ownPurchases, requestKey, keys, placements, now) {
  if (
    requestKey &&
    !Object.hasOwn(keys, requestKey) &&
    Object.keys(keys).length >= AD_POINTS_RULES.requestKeysPerAccount
  )
    throw error(429, 'Limite de chaves de anúncios desta conta atingido.');
  const recent = (user.adCreationTimes ?? ownPurchases.map((entry) => entry.createdAt)).filter(
    (at) => Number.isFinite(at) && at > now - 3600000,
  );
  if (recent.length >= AD_POINTS_RULES.purchasesPerHour)
    throw error(
      429,
      'Limite de novas campanhas por hora desta conta atingido. Aguarde para anunciar novamente.',
    );
  const removable = ownPurchases
    .filter((entry) => entry.status === 'cancelled' || entry.expiresAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt);
  const removeCount = Math.max(0, ownPurchases.length - AD_POINTS_RULES.historyPerAccount + 1);
  if (removable.length < removeCount)
    throw error(
      429,
      'Limite de histórico ativo desta conta atingido. Aguarde as campanhas terminarem.',
    );
  const active = state.mediaBids.filter((bid) => bid.expiresAt > now);
  if (
    active.length + placements.length > AD_POINTS_RULES.maxActiveTotal ||
    active.filter((bid) => bid.userId === user.id).length + placements.length >
      AD_POINTS_RULES.maxActivePerAccount
  )
    throw error(429, 'Limite de anúncios ativos atingido. Aguarde as campanhas atuais terminarem.');
  if (
    placements.some(
      (placement) =>
        active.filter((bid) => bid.screen === placement.screen).length >=
        AD_POINTS_RULES.maxActivePerScreen,
    )
  )
    throw error(409, 'Um dos telões está com a programação completa. Escolha outro telão.');
  return { recent, removable, removeCount };
}

function checkRefunds(state, user, refunds) {
  const refundable = refunds.filter(({ amount }) => amount > 0);
  const balance = getPointsBalance(state, user);
  const references = user.pointsWallet.references;
  if (
    !Number.isSafeInteger(balance + refundable.reduce((sum, entry) => sum + entry.amount, 0)) ||
    Object.keys(references).length + refundable.length > POINTS_RULES.referencesLimit ||
    refundable.some(({ reference }) => Object.hasOwn(references, reference))
  )
    throw error(409, 'Não foi possível confirmar a devolução dos pontos. Fale com o suporte.');
  return refundable;
}

function updateCancelledReceipts(purchases, user, bids) {
  for (const receipt of purchases) {
    if (receipt.userId !== user.id) continue;
    if (receipt.bids?.some((bid) => bids.some((targetBid) => targetBid.id === bid.id))) {
      // Snapshots desserializados não compartilham referências entre recibos e programação.
      receipt.bids = receipt.bids.map((bid) => bids.find((entry) => entry.id === bid.id) ?? bid);
      if (receipt.bids.every((bid) => bid.status === 'cancelled')) receipt.status = 'cancelled';
    }
  }
}

// A reserva e o débito são uma única mutação síncrona do snapshot do escritor único.
// O chamador confirma a persistência antes de devolver sucesso ao navegador.
export function purchaseAd(ctx, user, body) {
  const selected = selectScreens(user, body);
  const state = ctx.state;
  state.media ??= [];
  state.mediaBids ??= [];
  state.mediaPurchases ??= {};
  const placements = selectPlacements(state, user, body, selected);
  const fingerprint = hash(JSON.stringify(placements));
  const requestKey = requestKeyFor(body, user);
  const now = Date.now();
  const purchases = Object.values(state.mediaPurchases);
  const ownPurchases = purchases.filter((entry) => entry.userId === user.id);
  const keys = requestHistory(user, ownPurchases);
  // Uma chave explícita já usada sempre tem precedência sobre a deduplicação implícita.
  const { keyed, previous } = previousPurchase(
    ownPurchases,
    user,
    requestKey,
    keys,
    fingerprint,
    now,
    placements,
  );
  if (previous) return reusePurchase(ctx, user, previous, fingerprint, requestKey, keyed, keys);
  const { recent, removable, removeCount } = checkCapacity(
    state,
    user,
    ownPurchases,
    requestKey,
    keys,
    placements,
    now,
  );
  const ref = id();
  const total = placements.length * AD_POINTS_RULES.pricePerScreen;
  const expiresAt = now + AD_POINTS_RULES.durationSeconds * 1000;
  const bids = placements.map((placement) => ({
    ...placement,
    id: id(),
    ref,
    purchaseRef: ref,
    userId: user.id,
    cents: AD_POINTS_RULES.pricePerScreen,
    points: AD_POINTS_RULES.pricePerScreen,
    currency: 'points',
    pricingMode: 'fixed',
    status: 'live',
    createdAt: now,
    expiresAt,
  }));
  const purchase = {
    ref,
    userId: user.id,
    status: 'paid',
    paid: true,
    cents: total,
    points: total,
    total,
    creditCents: 0,
    currency: 'points',
    pricingMode: 'fixed',
    durationSeconds: AD_POINTS_RULES.durationSeconds,
    createdAt: now,
    expiresAt,
    bids,
    campaignFingerprint: fingerprint,
    ...(requestKey ? { requestKey } : {}),
  };
  const charge = debitPoints(state, user, {
    amount: total,
    reason: 'screen_campaign',
    reference: `ad:${requestKey ?? ref}`,
  });
  if (!charge.ok)
    throw error(
      charge.error === 'insufficient_points' ? 402 : 409,
      charge.error === 'insufficient_points'
        ? 'Pontos insuficientes para reservar os telões.'
        : 'Não foi possível confirmar o resgate de pontos.',
    );
  if (charge.duplicate) throw error(409, 'Pedido já processado. Consulte o histórico de anúncios.');
  if (requestKey) keys[requestKey] = { ref, fingerprint };
  user.adRequestKeys = keys;
  user.adCreationTimes = [...recent, now];
  for (const receipt of removable.slice(0, removeCount)) delete state.mediaPurchases[receipt.ref];
  // O arquivo de chaves por conta preserva retries mesmo após podar recibos.
  pruneAdSchedule(state, now);
  state.mediaBids.push(...bids);
  state.mediaPurchases[ref] = purchase;
  ctx.save();
  return purchase;
}

export function cancelAd(ctx, user, body) {
  if (!user?.id) throw error(401, 'Entre na sua conta para cancelar um anúncio.');
  const target = body?.ref ?? body?.id ?? body?.purchaseRef;
  if (typeof target !== 'string' || target.length > 100)
    throw error(400, 'Informe o anúncio a cancelar.');
  const state = ctx.state;
  const purchases = Object.values(state.mediaPurchases ?? {});
  const purchase = purchases.find((entry) => entry.ref === target && entry.userId === user.id);
  const bids = (state.mediaBids ?? []).filter(
    (bid) =>
      bid.userId === user.id &&
      bid.pricingMode === 'fixed' &&
      (purchase ? bid.ref === purchase.ref : bid.id === target),
  );
  if (!bids.length) throw error(404, 'Anúncio não encontrado.');
  const now = Date.now();
  const active = bids.filter((bid) => bid.status !== 'cancelled' && bid.expiresAt > now);
  const refunds = active.map((bid) => ({
    bid,
    amount: Math.max(
      0,
      Math.min(
        bid.points,
        Math.floor((bid.points * (bid.expiresAt - now)) / (AD_POINTS_RULES.durationSeconds * 1000)),
      ),
    ),
    reference: `ad-cancel:${bid.id}`,
  }));
  if (
    refunds.some(
      ({ bid, amount }) =>
        bid.points !== AD_POINTS_RULES.pricePerScreen || !Number.isSafeInteger(amount),
    )
  )
    throw error(409, 'O anúncio não permite cancelamento automático.');
  const refundable = checkRefunds(state, user, refunds);
  for (const { amount, reference } of refundable) {
    const result = creditPoints(state, user, {
      amount,
      reason: 'screen_cancel',
      reference,
    });
    if (!result.ok) throw error(409, 'Não foi possível confirmar a devolução dos pontos.');
  }
  for (const { bid, amount } of refunds)
    Object.assign(bid, {
      status: 'cancelled',
      cancelledAt: now,
      originalExpiresAt: bid.expiresAt,
      expiresAt: now,
      refundPoints: amount,
    });
  if (active.length) {
    updateCancelledReceipts(purchases, user, bids);
    ctx.save();
  }
  return {
    ok: true,
    currency: 'points',
    cancelled: active.length,
    refundPoints: refunds.reduce((sum, entry) => sum + entry.amount, 0),
    refundedPoints: refunds.reduce((sum, entry) => sum + entry.amount, 0),
    balance: getPointsBalance(state, user),
  };
}
