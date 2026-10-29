import { clientIp } from './runtime-config.js';
import { walletSummary } from './points.js';
import { pruneAdSchedule, AD_POINTS_RULES } from './ads-points.js';
import { screenDefinitions, rules, owner, production, state } from './media-common.js';

export const audienceRuntime = new WeakMap();

export function audiencePermit(ctx, req) {
  const now = Date.now();
  let runtime = audienceRuntime.get(ctx);
  if (!runtime) {
    runtime = { peers: new Map(), savedAt: 0 };
    audienceRuntime.set(ctx, runtime);
  }
  if (production(ctx)) {
    const peer = clientIp(req, ctx.config);
    if (now - (runtime.peers.get(peer) ?? 0) < 5000) return null;
    if (runtime.peers.size >= 2048) runtime.peers.delete(runtime.peers.keys().next().value);
    runtime.peers.set(peer, now);
  }
  return runtime;
}

export function pruneMediaHistory(ctx) {
  const now = Date.now();
  const superchats = ctx.state.superchats
    .filter((s) => s.expiresAt > now - 7 * 86400000)
    .slice(-2000);
  const changed =
    pruneAdSchedule(ctx.state, now) || superchats.length !== ctx.state.superchats.length;
  ctx.state.superchats = superchats;
  if (changed) ctx.save();
  // Recibos e suas chaves têm retenção por conta no próprio purchaseAd.
}

export function recentVisitors(entries, now) {
  return Object.fromEntries(
    Object.entries(entries ?? {})
      .filter(([, time]) => time > now - 86400000)
      .slice(-4096),
  );
}

export function getScreens(ctx) {
  state(ctx);
  pruneMediaHistory(ctx);
  const now = Date.now();
  ctx.state.mediaBids.forEach((bid) => {
    if (bid.expiresAt <= now && bid.status !== 'cancelled') bid.status = 'expired';
  });
  const screens = screenDefinitions.map((s) => {
    const active = ctx.state.mediaBids.filter(
      (b) => b.screen === s.id && b.expiresAt > now && b.status !== 'cancelled',
    );
    const bids = active
      .filter((b) => b.pricingMode !== 'fixed')
      .sort((a, b) => b.cents - a.cents || a.createdAt - b.createdAt);
    const fixed = active
      .filter((b) => b.pricingMode === 'fixed')
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    bids.forEach((bid, index) => {
      bid.status = index < rules.slots ? 'live' : 'queued';
      bid.queuePosition = index < rules.slots ? null : index - rules.slots + 1;
    });
    fixed.forEach((bid) => {
      bid.status = 'live';
      bid.queuePosition = null;
    });
    const content = (b) => {
      const m = ctx.state.media.find((m) => m.id === b.media);
      return {
        ...b,
        bidId: b.id,
        mediaId: b.media,
        nick: ctx.state.users?.find((u) => u.id === b.userId)?.nick ?? b.nick ?? 'Anunciante local',
        amount: b.cents,
        url: m?.url,
        poster: m?.poster,
        kind: m?.kind ?? 'image',
        since: b.createdAt,
        ms: m?.ms ?? 0,
      };
    };
    const ranking = [...bids.slice(0, rules.slots), ...fixed].map(content);
    const playlist = ranking.map((entry) => ({ ...entry, id: s.id }));
    return {
      ...s,
      size: s.kind,
      min: AD_POINTS_RULES.pricePerScreen,
      active: ranking.length,
      queued: Math.max(0, bids.length - rules.slots),
      queue: bids.slice(rules.slots).map(content),
      ranking,
      current: ranking.length ? { ...playlist[0], playlist } : null,
      history: [],
      fifthAmount: ranking[4]?.amount ?? null,
    };
  });
  return {
    screens,
    items: screens.filter((s) => s.current).map((s) => s.current),
    rules: {
      ...rules,
      ...AD_POINTS_RULES,
      purchasesEnabled: true,
      acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    },
    currency: 'points',
    biddingEnabled: false,
    purchasesEnabled: true,
    cycle: { loops: 3, imageSeconds: 10, cardSeconds: 5 },
  };
}

export function getSuperchats(ctx) {
  state(ctx);
  pruneMediaHistory(ctx);
  const now = Date.now();
  const items = ctx.state.superchats.filter((s) => s.expiresAt > now);
  const current = items.at(-1);
  return {
    items,
    waiting: 0,
    air: current ? { id: current.id, left: Math.max(0, current.airUntil - now) } : null,
  };
}
export async function recordMediaAudience({ req, ctx, send }) {
  const runtime = audiencePermit(ctx, req);
  if (!runtime) return send(200, { ok: true, local: true });
  const b = await ctx.body(req);
  const a = (ctx.state.mediaAudience ??= {
    since: Date.now(),
    pageViews: 0,
    views: 0,
    players: {},
  });
  const now = Date.now();
  const visitor =
    typeof b.visitor === 'string' && b.visitor ? `v:${b.visitor.slice(0, 100)}` : null;
  if (b.page) a.pageViews++;
  a.players = recentVisitors(a.players, now);
  if (b.play && visitor) a.players[visitor] = now;
  a.screens ??= {};
  const screens = [...new Set(Array.isArray(b.screens) ? b.screens : [])]
    .filter((screen) => screenDefinitions.some((s) => s.id === screen))
    .slice(0, 20);
  for (const screen of screens) {
    const stats = (a.screens[screen] ??= { views: [], visitors: {} });
    stats.views = stats.views.filter((time) => time > now - 86400000);
    stats.views = stats.views.slice(-4095);
    stats.views.push(now);
    stats.visitors = recentVisitors(stats.visitors, now);
    if (visitor) stats.visitors[visitor] = now;
  }
  a.views += screens.length;
  if (!production(ctx) || Date.now() - runtime.savedAt >= 60000) {
    ctx.save();
    runtime.savedAt = Date.now();
  }
  return send(200, { ok: true, local: true });
}
export async function mediaPanel({ ctx, user, send }) {
  const a = ctx.state.mediaAudience ?? {};
  return send(200, {
    ...getScreens(ctx),
    local: true,
    signedIn: !!user,
    live: true,
    turnstile: null,
    mine: {
      bids: ctx.state.mediaBids.filter((b) => owner(b, user)),
      media: ctx.state.media.filter((m) => owner(m, user)),
      credit: user ? walletSummary(ctx.state, user).balance : 0,
      reservedCredit: 0,
      currency: 'points',
    },
    audience: {
      screens: screenDefinitions.map((s) => {
        const stats = a.screens?.[s.id];
        return {
          id: s.id,
          views: (stats?.views ?? []).filter((time) => time > Date.now() - 86400000).length,
          viewers: Object.values(stats?.visitors ?? {}).filter(
            (time) => time > Date.now() - 86400000,
          ).length,
        };
      }),
      since: a.since ?? Date.now(),
      pageViews: a.pageViews ?? 0,
      views: a.views ?? 0,
      views24h: Object.values(a.screens ?? {}).reduce(
        (total, stats) => total + stats.views.filter((time) => time > Date.now() - 86400000).length,
        0,
      ),
      players24h: Object.values(a.players ?? {}).filter((t) => t > Date.now() - 86400000).length,
    },
  });
}
