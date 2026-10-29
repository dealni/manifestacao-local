import fs from 'node:fs';
import path from 'node:path';
import { debitPoints } from './points.js';
import { purchaseAd, cancelAd } from './ads-points.js';
import { prefix, id, fail, superchatRules, owner, production } from './media-common.js';
import {
  pendingUploads,
  permitUpload,
  persistRemoval,
  store,
  saveUpload,
} from './media-storage.js';
import { pruneMediaHistory, getScreens, getSuperchats } from './media-screens.js';

export async function uploadScreenMedia({ req, url, ctx, user, requireSession, send }) {
  permitUpload(ctx, user, true);
  const aspects = [...new Set((url.searchParams.get('aspect') ?? '16:9').split(','))];
  if (!aspects.length || aspects.some((aspect) => !['16:9', '9:16'].includes(aspect)))
    throw fail(400, 'Formato de telão inválido.');
  const file = await store(ctx, await ctx.readBody(req), false, user, requireSession);
  try {
    requireSession();
  } catch (error) {
    pendingUploads.get(ctx)?.delete(file);
    fs.rmSync(path.join(ctx.dataDir, 'uploads', file.filename), { force: true });
    throw error;
  }
  const group = id();
  // Local variants share the original file; the renderer fits it without cropping.
  const variants = aspects.map((aspect) => {
    const media = {
      ...file,
      id: id(),
      group,
      userId: user.id,
      status: 'approved',
      kind: file.mime.startsWith('video/') ? 'video' : 'image',
      aspect,
      createdAt: Date.now(),
      ms: 0,
      local: true,
    };
    media.url = `${prefix}/local-media/${media.id}`;
    if (media.kind === 'image') media.poster = media.url;
    return media;
  });
  const copies = Object.fromEntries(variants.map((media) => [media.aspect, media.id]));
  variants.forEach((media) => {
    media.copies = copies;
  });
  saveUpload(ctx, user, file, 'media', variants);
  return send(200, variants[0]);
}
export async function getScreenMedia({ url, ctx, user, send }) {
  const media = ctx.state.media.find((m) => m.id === url.searchParams.get('id') && owner(m, user));
  if (!media) throw fail(404, 'Mídia não encontrada.');
  return send(200, media);
}
export async function removeScreenMedia({ url, ctx, user, requireSession, send }) {
  requireSession();
  const media = ctx.state.media.find(
    (entry) => entry.id === url.searchParams.get('id') && owner(entry, user),
  );
  if (!media) throw fail(404, 'Mídia não encontrada nesta conta.');
  const variants = ctx.state.media.filter(
    (entry) =>
      owner(entry, user) && (entry === media || (media.group && entry.group === media.group)),
  );
  const ids = new Set(variants.map((entry) => entry.id));
  if (
    ctx.state.mediaBids.some(
      (bid) => ids.has(bid.media) && bid.status !== 'cancelled' && bid.expiresAt > Date.now(),
    )
  )
    throw fail(409, 'Cancele ou aguarde os anúncios desta mídia antes de excluí-la.');
  const retained = ctx.state.media.filter((entry) => !ids.has(entry.id));
  ctx.state.media = retained;
  const cleanupPending = await persistRemoval(
    ctx,
    variants.map((entry) => entry.filename),
    () => {
      // Preserve alterações concorrentes enquanto restaura somente esta exclusão.
      for (const variant of variants)
        if (!ctx.state.media.some((entry) => entry.id === variant.id))
          ctx.state.media.push(variant);
    },
  );
  return send(200, { status: 'deleted', ids: [...ids], cleanupPending, local: true });
}
export async function getAdPurchase({ url, ctx, user, send }) {
  const purchase = ctx.state.mediaPurchases[url.searchParams.get('ref')];
  if (!owner(purchase, user)) throw fail(404, 'Pedido não encontrado.');
  return send(200, purchase);
}
export async function buyAd({ req, ctx, user, requireSession, send }) {
  const body = await ctx.body(req);
  requireSession();
  const purchase = purchaseAd(ctx, user, body);
  ctx.broadcast?.({ t: 'screens', ...getScreens(ctx) });
  return send(200, purchase);
}
export async function cancelAdPurchase({ req, ctx, user, requireSession, send }) {
  const body = await ctx.body(req);
  requireSession();
  const cancelled = cancelAd(ctx, user, body);
  ctx.broadcast?.({ t: 'screens', ...getScreens(ctx) });
  return send(200, cancelled);
}
export async function getSuperchatPurchase({ url, ctx, user, send }) {
  const p = ctx.state.superchats.find(
    (s) => s.ref === url.searchParams.get('ref') && owner(s, user),
  );
  if (!p) throw fail(404, 'Superchat não encontrado.');
  return send(200, p);
}
export async function buySuperchat({ req, ctx, user, requireSession, send }) {
  if (
    ctx.freeAccess === true &&
    (user.verified !== true || user.nickPending === true || !user.nick)
  )
    throw fail(403, 'Confirme seu e-mail e escolha um apelido para enviar um destaque.');
  const b = await ctx.body(req);
  requireSession();
  pruneMediaHistory(ctx);
  if (
    (production(ctx) || ctx.freeAccess === true) &&
    ctx.state.superchats.some((s) => owner(s, user) && s.createdAt > Date.now() - 30000)
  )
    throw fail(429, 'Aguarde 30 segundos antes de enviar outro destaque.');
  const message = String(b.message ?? '').trim();
  if (message.length > superchatRules.maxChars || !message)
    throw fail(400, 'Escreva uma mensagem de até 400 caracteres.');
  const amount = superchatAmount(b);
  const reference = id();
  const charge = debitPoints(ctx.state, user, {
    amount,
    reason: 'superchat',
    reference: `superchat:${reference}`,
  });
  if (!charge.ok)
    throw fail(
      409,
      charge.error === 'insufficient_points'
        ? 'Saldo de pontos insuficiente.'
        : 'Não foi possível usar os pontos nesta operação.',
    );
  const sc = {
    id: id(),
    ref: reference,
    userId: user.id,
    nick: String(user.nick || b.nick || 'Visitante').slice(0, 30),
    message,
    cents: amount,
    points: amount,
    currency: 'points',
    status: 'paid',
    voice: null,
    audio: null,
    local: true,
    free: false,
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    airUntil: Date.now() + 15000,
  };
  ctx.state.superchats.push(sc);
  ctx.save();
  const list = getSuperchats(ctx);
  ctx.broadcast?.({ t: 'sc_list', items: list.items, waiting: 0 });
  ctx.broadcast?.({ t: 'sc_air', air: list.air });
  return send(200, sc);
}

function superchatAmount(b) {
  const amount = b.points ?? b.cents;
  if (!Number.isSafeInteger(amount) || amount < superchatRules.min || amount > superchatRules.max)
    throw fail(400, 'Quantidade de pontos inválida.');
  return amount;
}
