import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { debitPoints } from './points.js';
import { sanitizeAppearance } from './game-permissions.js';
import { prefix, fail, designPoints, freeDesign, owner } from './media-common.js';
import {
  pendingUploads,
  reserveDesign,
  permitUpload,
  persistRemoval,
  store,
  saveUpload,
} from './media-storage.js';

export async function uploadDesign({ req, url, ctx, user, requireSession, send, account }) {
  permitUpload(ctx, user, true);
  const kind = url.searchParams.get('tipo') ?? 'cartaz';
  if (!['cartaz', 'bandeira'].includes(kind)) throw fail(400, 'Tipo de design inválido.');
  const releaseReservation = reserveDesign(ctx, user, kind);
  let record;
  try {
    record = await store(ctx, await ctx.readBody(req), true, user, requireSession);
    try {
      requireSession();
    } catch (error) {
      fs.rmSync(path.join(ctx.dataDir, 'uploads', record.filename), { force: true });
      throw error;
    }
    const design = {
      ...record,
      id: (kind === 'cartaz' ? 'c' : 'b') + randomBytes(8).toString('hex').slice(0, 15),
      userId: user.id,
      kind,
      text: (url.searchParams.get('texto') ?? '').slice(0, 400),
      status: 'approved',
      paid: freeDesign(ctx, user),
      free: freeDesign(ctx, user),
      included: freeDesign(ctx, user),
      cents: freeDesign(ctx, user) ? 0 : designPoints,
      points: freeDesign(ctx, user) ? 0 : designPoints,
      currency: 'points',
      createdAt: Date.now(),
      local: true,
    };
    design.url = `${prefix}/cartaz/m/${design.id}.png`;
    saveUpload(ctx, user, record, 'designs', [design]);
    return send(200, { design, account: await account(), local: true });
  } finally {
    pendingUploads.get(ctx)?.delete(record);
    releaseReservation();
  }
}
export async function updateDesign({ req, ctx, user, requireSession, send, account, route }) {
  const b = await ctx.body(req);
  requireSession();
  const design = ctx.state.designs.find((d) => d.id === b.id && owner(d, user));
  if (!design) throw fail(404, 'Design não encontrado nesta conta.');
  const restoreAppearance = [];
  let cleanupPending = false;
  if (route.endsWith('/excluir')) {
    removeDesignReferences(ctx, user, design, restoreAppearance);
  } else {
    activateDesign(ctx, user, design);
  }
  if (route.endsWith('/excluir'))
    cleanupPending = await persistRemoval(ctx, [design.filename], () => {
      if (!ctx.state.designs.some((entry) => entry.id === design.id))
        ctx.state.designs.push(design);
      for (const restore of restoreAppearance) restore();
    });
  else ctx.save();
  return send(200, {
    status: route.endsWith('/excluir') ? 'deleted' : 'paid',
    id: design.id,
    ...(route.endsWith('/excluir') ? { cleanupPending } : {}),
    free: design.free === true,
    cents: design.points ?? 0,
    points: design.points ?? 0,
    currency: 'points',
    account: await account(),
    local: true,
  });
}
export async function designPrice({ ctx, user, send, account }) {
  return send(200, {
    status: 'ready',
    free: freeDesign(ctx, user),
    cents: freeDesign(ctx, user) ? 0 : designPoints,
    points: freeDesign(ctx, user) ? 0 : designPoints,
    currency: 'points',
    account: await account(),
    local: true,
  });
}

function removeDesignReferences(ctx, user, design, restoreAppearance) {
  ctx.state.designs = ctx.state.designs.filter((d) => d !== design);
  if (user.design === design.id) {
    delete user.design;
    restoreAppearance.push(() => {
      if (user.design === undefined) user.design = design.id;
    });
  }
  for (const visual of [user.visual, user.appearance]) {
    if (visual?.design !== design.id) continue;
    const previous = visual.appearance;
    delete visual.design;
    if (Object.hasOwn(visual, 'appearance'))
      visual.appearance = sanitizeAppearance({ userId: user.id }, ctx, previous);
    const cleared = visual.appearance;
    restoreAppearance.push(() => {
      if (visual.design !== undefined) return;
      visual.design = design.id;
      if (visual.appearance === cleared && Object.hasOwn(visual, 'appearance'))
        visual.appearance = previous;
    });
  }
  for (const player of ctx.players?.values() ?? []) {
    if (player.design !== design.id) continue;
    const previous = player.appearance;
    player.design = null;
    player.appearance = sanitizeAppearance(player, ctx, previous);
    const cleared = player.appearance;
    restoreAppearance.push(() => {
      if (player.design !== null) return;
      player.design = design.id;
      if (player.appearance === cleared) player.appearance = previous;
      ctx.refreshPlayerAppearance?.(player);
    });
    ctx.refreshPlayerAppearance?.(player);
  }
}
function activateDesign(ctx, user, design) {
  if (design.status !== 'approved') throw fail(403, 'Este design ainda não foi aprovado.');
  if (!design.paid && freeDesign(ctx, user)) {
    design.paid = true;
    design.free = true;
    design.included = true;
    design.points = 0;
    design.cents = 0;
    design.currency = 'points';
  }
  if (!design.paid) {
    const charge = debitPoints(ctx.state, user, {
      amount: designPoints,
      reason: 'design',
      reference: `design:${design.id}`,
    });
    if (!charge.ok)
      throw fail(
        409,
        charge.error === 'insufficient_points'
          ? 'Saldo de pontos insuficiente.'
          : 'Não foi possível usar os pontos nesta operação.',
      );
    design.paid = true;
    design.free = false;
    design.points = designPoints;
    design.currency = 'points';
  }
  user.design = design.id;
  for (const visual of [user.visual, user.appearance])
    if (visual && typeof visual === 'object') visual.design = design.id;
}
