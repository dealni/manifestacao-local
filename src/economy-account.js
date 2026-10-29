import { initializeWallet, walletSummary, ensureReferralCode } from './points.js';
import { authAvailability } from './auth.js';
import {
  catalog,
  POINT_COSTS,
  PASS_KEYS,
  PASS_COSTS,
  OBJECT_KEYS,
  FLAG_KEYS,
  BASIC_FLAG_KEYS,
  VEHICLE_KEYS,
  entitlements,
  hasFreeMissionDesigns,
  localInk,
} from './economy-catalog.js';

const products = (keys, cost) =>
  keys.map((key) => ({
    key,
    name: key,
    cents: typeof cost === 'number' ? cost : cost[key],
    points: typeof cost === 'number' ? cost : cost[key],
    currency: 'points',
    enabled: true,
    local: true,
  }));

/** Compatibility contract inferred from the public client, never a remote account. */
export function buildAccount(ctx, user, req = null) {
  const freeAccess = ctx.freeAccess === true;
  const characters = catalog(ctx).map((item) => {
    const originalCents = item.originalCents ?? item.cents ?? 0,
      points = freeAccess ? 0 : originalCents >= 10000 ? 500 : POINT_COSTS.personagem;
    return {
      ...item,
      originalCents,
      cents: points,
      points,
      currency: 'points',
      enabled: true,
      local: true,
    };
  });
  if (user) {
    initializeWallet(ctx.state, user);
    ensureReferralCode(ctx.state, user);
  }
  const wallet = user ? walletSummary(ctx.state, user) : null;
  const account = {
    freeAccess,
    access: freeAccess ? entitlements(ctx, user) : null,
    auth: authAvailability(ctx),
    media: {
      uploadsAvailable: !!user?.verified && !user?.nickPending,
      designPoints: hasFreeMissionDesigns(user) ? 0 : 100,
      acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      ads: {
        purchasesEnabled: true,
        pricingMode: 'fixed',
        pricePerScreen: 100,
        durationSeconds: 86400,
      },
    },
    local: true,
    simulation: true,
    currency: 'points',
    paymentsEnabled: false,
    wallet,
    referral: user ? { code: ensureReferralCode(ctx.state, user) } : null,
    authenticated: !!user,
    notice:
      'Use pontos do jogo para desbloquear itens. Pagamentos reais ainda não estão disponíveis.',
    user: null,
    ticket: null,
    acesso: { enabled: true, cents: 500, points: 500, permanent: true },
    passes: products(PASS_KEYS, PASS_COSTS),
    pvp: { enabled: true, cents: 150, points: 150 },
    objetos: products(OBJECT_KEYS, 50).map((item) =>
      item.key === 'push' ? { ...item, cents: 0, points: 0, basic: true } : item,
    ),
    bandeiras: products(FLAG_KEYS, 50).map((item) =>
      BASIC_FLAG_KEYS.includes(item.key) ? { ...item, cents: 0, points: 0, basic: true } : item,
    ),
    veiculos: products(VEHICLE_KEYS, 150).map((item) =>
      ['carro', 'moto'].includes(item.key) ? { ...item, cents: 0, points: 0, basic: true } : item,
    ),
    personagens: characters,
    cartazes: {
      cartaz: hasFreeMissionDesigns(user) ? 0 : 100,
      bandeira: hasFreeMissionDesigns(user) ? 0 : 100,
      currency: 'points',
    },
    tinta: { enabled: false, cents: 25, points: 25, per: 1000, free: 1000000, unlimited: true },
    parceiros: [],
    kickVincular: false,
    superchat: {
      live: true,
      min: 100,
      max: 100000,
      maxChars: 400,
      suggested: [100, 1000, 2000, 5000],
      voices: [],
      local: true,
    },
  };
  if (freeAccess) {
    account.notice =
      'Personagens, veículos, bandeiras e objetos liberados para todos. Entre por e-mail para salvar progresso, conversar em privado e publicar conteúdo próprio.';
    account.acesso = { ...account.acesso, cents: 0, points: 0 };
    account.pvp = { ...account.pvp, cents: 0, points: 0 };
    for (const key of ['passes', 'objetos', 'bandeiras', 'veiculos'])
      account[key] = account[key].map((item) => ({ ...item, cents: 0, points: 0, free: true }));
    account.media.designPoints = 0;
    account.cartazes = { cartaz: 0, bandeira: 0, currency: 'points' };
  }
  if (!user) return account;
  account.ticket = ctx.issueAccountTicket?.(user, req) ?? null;
  account.user = accountUser(ctx, user, freeAccess, wallet);
  return account;
}

function accountUser(ctx, user, freeAccess, wallet) {
  const designs = (ctx.state.designs ?? []).filter(
    (d) => String(d.userId ?? d.owner) === String(user.id),
  );
  const owned = entitlements(ctx, user);
  return {
    id: user.id,
    nick: user.nick || 'Visitante local',
    nickPending: !!user.nickPending,
    email: user.email ?? '',
    visual: user.visual ?? user.appearance ?? null,
    acesso: {
      active: owned.acesso,
      permanent: owned.acesso,
      posters: {
        limit: 20,
        total: 20,
        used: designs.length,
        remaining: Math.max(0, 20 - designs.length),
      },
    },
    premium: owned.acesso,
    alwaysOnline: false,
    apoiador: user.premium === true,
    cartazLivre: owned.acesso || hasFreeMissionDesigns(user),
    designsFree: freeAccess || hasFreeMissionDesigns(user),
    cartazesIlimitados: owned.acesso,
    wallet,
    passes: owned.passes,
    personagens: owned.personagens,
    bandeiras: owned.bandeiras,
    veiculos: owned.veiculos,
    pvp: owned.pvp,
    pvpItems: owned.objetos,
    cartazes: designs,
    recompensas: user.recompensas ?? [],
    tinta: localInk(user),
    local: true,
  };
}
