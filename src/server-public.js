import path from 'node:path';

import { MIME } from './server-values.js';
export async function servePublic(r, req, res, url) {
  if (url.pathname.startsWith('/api/'))
    return r.ctx.send(res, 404, {
      error: 'Rota ainda não reconstruída nesta instalação.',
      local: true,
      path: url.pathname,
    });
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return r.ctx.send(res, 405, { error: 'Método não permitido.' });
  }
  if (url.pathname === '/sw.js') {
    res.setHeader('Content-Type', MIME['.js']);
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));",
    );
    return;
  }
  let requested;
  try {
    requested = decodeURIComponent(url.pathname);
  } catch {
    return r.ctx.send(res, 400, { error: 'Caminho inválido.' });
  }
  if (requested.includes('\0') || requested.split('/').includes('..'))
    return r.ctx.send(res, 400, { error: 'Caminho inválido.' });
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const resolved = path.resolve(r.publicDir, relative);
  if (!resolved.startsWith(r.publicDir + path.sep))
    return r.ctx.send(res, 403, { error: 'Caminho não permitido.' });
  if (await r.staticFile(req, res, resolved)) return;
  if (institutionalPage(r, res, requested)) return;
  return r.ctx.send(res, 404, {
    error: 'Arquivo local não encontrado.',
    path: requested,
  });
}
function institutionalPage(r, res, requested) {
  if (['/sobre', '/privacidade', '/termos'].includes(requested)) {
    // Texto institucional local: não usar termos ou promessas do serviço original.
    res.setHeader('Content-Type', MIME['.html']);
    res.end(
      r.config.production
        ? `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Brasília Livre · Beta gratuito</title><body style="font:18px system-ui;line-height:1.6;max-width:800px;margin:32px auto;padding:0 20px;background:#161a1f;color:white"><h1>Brasília Livre · Beta gratuito</h1><p>Jogo independente em fase beta, com cenário estilizado de Brasília e servidor próprio. Não é operado pelo serviço original de onde vieram os assets públicos.</p><p>O jogo é gratuito. Personagens, veículos, bandeiras, objetos e corrida estão liberados para visitantes. Entre por e-mail para salvar progresso, usar amigos e mensagens privadas e publicar cartazes, anúncios ou destaques. Cartazes pessoais são gratuitos, com limite de quantidade. Anúncios custam 100 pontos por telão durante 24 horas e destaques custam a partir de 100 pontos. Pontos não representam dinheiro; limites de quantidade e frequência se aplicam. Não há pagamentos reais nem compra de pontos com dinheiro nesta versão.</p><p>Contas, sessões, mensagens e progresso são armazenados na VPS com PostgreSQL; as imagens enviadas ficam na VPS para funcionamento do jogo. O login usa um código enviado por e-mail através do Cloudflare. Não publique dados pessoais nos espaços públicos.</p><p>Denúncias podem guardar o conteúdo denunciado e os apelidos envolvidos por até 30 dias para consulta administrativa, com limite de registros.</p><p>O microfone é opcional e depende da sua permissão no navegador. Para falar, suba em um palanque ou no palco de um caminhão de som e use Falar no palco ou T. Uma pessoa fala por vez, com alcance de até 60 metros. Para ouvir, ative o som geral e a voz dos palcos no painel Som. O áudio passa pelo servidor durante a transmissão e não é gravado. Mesas de debate e grupos usam apenas chat.</p><p>O serviço pode ser interrompido para manutenção. Contato e solicitações sobre os dados: administração do jogo.</p><p><a href="/" style="color:#ffd900">Voltar ao jogo</a></p></body></html>`
        : `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reconstrução local</title><body style="font:18px system-ui;line-height:1.6;max-width:800px;margin:32px auto;padding:0 20px;background:#161a1f;color:white"><h1>Reconstrução local do Brasília Livre</h1><p>Esta instalação pessoal reproduz o cliente público e implementa um servidor local próprio. Não é operada pelo serviço original.</p><p>Personagens, veículos, bandeiras, objetos e corrida estão liberados para visitantes. Contas guardam progresso, amigos, mensagens e uploads nesta instalação. Cartazes pessoais são gratuitos com conta. Anúncios custam 100 pontos por telão por 24 horas e destaques custam a partir de 100 pontos, sujeitos a limites. No desenvolvimento sem transporte de e-mail, o código aparece na tela; quando configurado, é enviado por e-mail. Não há pagamentos reais ou login por redes sociais.</p><p>O microfone é opcional e depende da sua permissão no navegador. Para falar, suba em um palanque ou no palco de um caminhão de som e use Falar no palco ou T. Uma pessoa fala por vez, com alcance de até 60 metros. Para ouvir, ative o som geral e a voz dos palcos no painel Som. O áudio passa pelo servidor durante a transmissão e não é gravado. Mesas de debate e grupos usam apenas chat.</p><p><a href="/" style="color:#ffd900">Voltar ao jogo</a></p></body></html>`,
    );
    return true;
  }
  return false;
}
