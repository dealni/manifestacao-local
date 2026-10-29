import { mutationSession } from './auth.js';
import { prefix, state, fail } from './media-common.js';
import { fileResponse } from './media-storage.js';
import { recordMediaAudience, mediaPanel } from './media-screens.js';
import { uploadDesign, updateDesign, designPrice } from './media-designs.js';
import {
  uploadScreenMedia,
  getScreenMedia,
  removeScreenMedia,
  getAdPurchase,
  buyAd,
  cancelAdPurchase,
  getSuperchatPurchase,
  buySuperchat,
} from './media-campaigns.js';
export { getScreens, getSuperchats } from './media-screens.js';

const routes = new Map([
  ['POST /cartaz', uploadDesign],
  ['POST /cartaz/ativar', updateDesign],
  ['POST /cartaz/excluir', updateDesign],
  ['POST /cartaz/comprar', updateDesign],
  ['GET /cartaz/comprar', designPrice],
  ['POST /telao/midia', uploadScreenMedia],
  ['GET /telao/midia', getScreenMedia],
  ['DELETE /telao/midia', removeScreenMedia],
  ['GET /telao/lance', getAdPurchase],
  ['POST /telao/lance', buyAd],
  ['POST /telao/cancelar', cancelAdPurchase],
  ['GET /superchat', getSuperchatPurchase],
  ['POST /superchat', buySuperchat],
]);

function downloadMedia(req, res, route, ctx) {
  const designMatch = /^\/cartaz\/m\/([cb][0-9a-f]{15})\.png$/.exec(route);
  const mediaMatch = /^\/local-media\/([a-f0-9]{24})$/.exec(route);
  if (!(designMatch || mediaMatch) || !['GET', 'HEAD'].includes(req.method)) return false;
  const record = designMatch
    ? ctx.state.designs.find((d) => d.id === designMatch[1])
    : ctx.state.media.find((m) => m.id === mediaMatch[1]);
  fileResponse(req, res, ctx, record);
  return true;
}

export async function handleMedia(req, res, url, ctx) {
  const route = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname;
  if (
    !/^\/(cartaz(?:\/|$)|telao(?:\/|$)|teloes(?:\/|$)|superchat(?:\/|$)|local-media\/)/.test(route)
  )
    return false;
  state(ctx);
  const send = (status, data) => {
    ctx.send(res, status, data);
    return true;
  };
  try {
    if (downloadMedia(req, res, route, ctx)) return true;
    if (route === '/telao/audiencia' && req.method === 'POST')
      return await recordMediaAudience({ req, ctx, send });
    const user = ctx.user(req);
    const requireSession = mutationSession(req, ctx.state, user);
    if (route === '/teloes/painel' && req.method === 'GET')
      return await mediaPanel({ ctx, user, send });
    if (!user) throw fail(401, 'Entre em uma conta local para continuar.');
    const handler = routes.get(req.method + ' ' + route);
    if (handler)
      return await handler({
        req,
        url,
        ctx,
        user,
        requireSession,
        send,
        account: () => ctx.account(req),
        route,
      });
    return send(404, { error: 'Rota de mídia não encontrada.' });
  } catch (error) {
    return send(error.status ?? 500, {
      error: error.status ? error.message : 'Falha ao processar mídia local.',
    });
  }
}
