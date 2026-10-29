import { mutationSession } from './auth.js';
import { buildAccount } from './economy-account.js';
import { localInk } from './economy-catalog.js';
import { shopListing, saveVisual } from './economy-views.js';
import { purchaseProduct } from './economy-purchase.js';
export { buildAccount } from './economy-account.js';
export {
  FLAG_KEYS,
  BASIC_FLAG_KEYS,
  VEHICLE_KEYS,
  OBJECT_KEYS,
  POINT_COSTS,
  entitlements,
  hasFreeMissionDesigns,
  localInk,
} from './economy-catalog.js';
export { PURCHASE_LIMITS } from './economy-purchase.js';
const PREFIX = '/api/jogos/manifestacao';
export async function handleEconomy(req, res, url, ctx) {
  if (!url.pathname.startsWith(`${PREFIX}/`)) return false;
  const route = url.pathname.slice(PREFIX.length + 1);
  const purchases = new Set([
    'acesso',
    'passe',
    'pvp',
    'objeto',
    'bandeira',
    'veiculo',
    'personagem',
    'tinta',
  ]);
  if (!['conta', 'loja', 'visual', 'parceiro', ...purchases].includes(route)) return false;
  const send = (status, data) => {
    ctx.send(res, status, data);
    return true;
  };
  const user = ctx.user(req);
  const requireSession = mutationSession(req, ctx.state, user);
  if (matchesRoute(req, route, 'conta', 'GET')) return send(200, buildAccount(ctx, user, req));
  if (matchesRoute(req, route, 'loja', 'GET')) return shopListing({ ctx, user, req, url, send });
  if (matchesRoute(req, route, 'parceiro', 'GET'))
    return send(200, { local: true, enabled: false, partners: [] });
  if (!user) return send(401, { error: 'Entre com uma conta local para salvar.', local: true });
  if (matchesRoute(req, route, 'visual', 'POST'))
    return saveVisual({ ctx, user, req, requireSession, send });
  if (purchases.has(route) && req.method === 'GET')
    return purchaseReceipt({ ctx, user, req, url, send });
  if (purchases.has(route) && req.method === 'POST')
    return purchaseProduct({ ctx, user, req, requireSession, send, route });
  return send(405, { error: 'Método não permitido.', local: true });
}

function purchaseReceipt({ ctx, user, req, url, send }) {
  const purchase = ctx.state.purchases?.[url.searchParams.get('ref')];
  if (!purchase || String(purchase.userId) !== String(user.id))
    return send(404, { error: 'Compra local não encontrada.' });
  return send(200, { ...purchase, account: buildAccount(ctx, user, req), tinta: localInk(user) });
}

function matchesRoute(req, route, name, method) {
  return route === name && req.method === method;
}
