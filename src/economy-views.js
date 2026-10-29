import { canUseCharacter, sanitizeAppearance } from './game-permissions.js';
import { buildAccount } from './economy-account.js';
import { entitlements } from './economy-catalog.js';
export async function shopListing({ ctx, user, req, url, send }) {
  let items = buildAccount(ctx, user, req).personagens;
  const q = (url.searchParams.get('q') ?? '').trim().toLocaleLowerCase('pt-BR');
  if (q)
    items = items.filter((i) =>
      `${i.key} ${i.name} ${i.description}`.toLocaleLowerCase('pt-BR').includes(q),
    );
  if (url.searchParams.get('owned') === '1') {
    const ownedCharacters = new Set(
      user || ctx.freeAccess === true ? entitlements(ctx, user).personagens : [],
    );
    items = items.filter((item) => ownedCharacters.has(item.key));
  }
  const total = items.length,
    offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50),
  );
  return send(200, {
    items: items.slice(offset, offset + limit),
    total,
    offset,
    limit,
    hasMore: offset + limit < total,
    local: true,
  });
}

export async function saveVisual({ ctx, user, req, requireSession, send }) {
  const body = await ctx.body(req);
  requireSession();
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return send(400, { error: 'Visual inválido.' });
  const visual = {};
  for (const key of ['team', 'character', 'shirt', 'appearance']) {
    const value = body[key];
    if (typeof value === 'number' && Number.isFinite(value)) visual[key] = value;
    else if (typeof value === 'string' && value.length <= 100) visual[key] = value;
  }
  if (setVisualSkin(body, visual, ctx, user, send)) return true;
  if (
    Object.hasOwn(visual, 'character') &&
    !canUseCharacter({ userId: user.id }, ctx, visual.character)
  )
    return send(400, { error: 'Personagem indisponível nesta conta.' });
  // The original client sends the selected poster/flag ID, never a design object.
  if (setVisualDesign(body, visual, ctx, user, send)) return true;
  user.visual = visual;
  user.appearance = visual;
  ctx.save();
  return send(200, { ok: true, visual, account: buildAccount(ctx, user, req) });
}

function setVisualDesign(body, visual, ctx, user, send) {
  if (Object.hasOwn(body, 'design')) {
    if (body.design === null || body.design === '') visual.design = null;
    else {
      const design = (ctx.state.designs ?? []).find(
        (item) => item.id === body.design && String(item.userId ?? item.owner) === String(user.id),
      );
      if (
        typeof body.design !== 'string' ||
        !design ||
        design.paid !== true ||
        design.status !== 'approved'
      )
        return send(400, { error: 'Design indisponível nesta conta.' });
      visual.design = design.id;
    }
  }
  if (Object.hasOwn(visual, 'appearance'))
    visual.appearance = sanitizeAppearance(
      { userId: user.id, design: visual.design },
      ctx,
      visual.appearance,
    );
  return false;
}

function setVisualSkin(body, visual, ctx, user, send) {
  if (Object.hasOwn(body, 'skin')) {
    if (body.skin === null || body.skin === '') visual.skin = null;
    else if (
      typeof body.skin === 'string' &&
      entitlements(ctx, user).personagens.includes(body.skin)
    )
      visual.skin = body.skin;
    else return send(400, { error: 'Personagem local desconhecido.' });
  }
  return false;
}
