import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { applyBrasiliaScene } from './brasilia-scene.js';
import { applyPublicCopy } from './public-copy.js';
import { applyBrasiliaSpray } from './brasilia-spray.js';
import {
  applyProductionClient,
  applyProductionHtml,
  versionMutableAssets,
} from './production-client.js';
import { applyBrasiliaContent, brasiliaText } from './brasilia-content.js';
import { applyPointsClient } from './points-client.js';
import { applyFreeAccessClient } from './free-access-client.js';
import { applyAmbientPopulation } from './ambient-population.js';
import { applyAmbientAudio, removeCrowdLoop } from './ambient-audio.js';
import { applyStageVoiceClient } from './stage-voice-client.js';
import { applyPresenceClient } from './presence-client.js';
import { applyDesignClient } from './design-client.js';
import { applyVoiceCopyDesign } from './design-voice-copy.js';
import { applyHudDesign } from './design-hud.js';
import { applyCleanDesktop } from './hud-clean-desktop.js';
import { applyCleanSuperchat } from './hud-clean-superchat.js';
import { applyCleanOverlays } from './hud-clean-overlays.js';
import { applySocialDesign } from './design-social.js';
import { applyMediaDesign } from './design-media.js';
import { applyShopDesign } from './design-shop.js';
import { applyAuthDesign } from './design-auth.js';
import { applyActivitiesDesign } from './design-activities.js';
import { applyTurnstileClient } from './turnstile-client.js';
import { allowTurnstileCsp } from '../src/turnstile.js';
import { writePaintTerrain } from './prepare-paint-terrain.js';
import { applyMusicCatalog } from './music-catalog-client.js';
import { applySoundControlsClient } from './sound-controls-client.js';
import { applyMobilePerformance } from './mobile-performance.js';
import { applyVehicleSeatClient } from './vehicle-seat-client.js';
import { applyMusicPlaybackClient } from './music-playback-client.js';

// Adaptação reproduzível sobre a base local com identificadores editoriais omitidos.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = path.join(root, 'public');
const original = await fs.readFile(path.join(archive, 'assets/index-DYj4UDIq.js'), 'utf8');
let source = await format(original, { parser: 'babel' });
await fs.writeFile(path.join(root, 'analysis/client-readable.js'), source);
const applied = [];
function patch(name, before, after) {
  if (!source.includes(before)) throw new Error(`Patch incompatível: ${name}`);
  if (source.indexOf(before) !== source.lastIndexOf(before))
    throw new Error(`Patch ambíguo: ${name}`);
  source = source.replace(before, after);
  applied.push(name);
}
function replaceFunction(name, replacement) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Função ausente: ${name}`);
  // As funções selecionadas são declarações de nível superior, com a chave final sem indentação.
  const end = source.indexOf('\n}', start) + 2;
  if (end < start) throw new Error(`Fim ausente: ${name}`);
  patch(name, source.slice(start, end), replacement);
}
patch('origem própria', 'const Ao = "https://referencia.invalid",', 'const Ao = location.origin,');
patch(
  'retratos sem handler inline',
  'onerror="this.style.visibility=\'hidden\'"',
  'data-local-hide-on-error',
);
patch(
  'ícone de instalação disponível',
  '${Ps}icons/icon-192.png',
  '${Ps}icons/apple-touch-icon.png',
);
patch(
  'host local',
  'tl = /(^|\\.)referencia\\.invalid$/.test(s_),',
  'tl = ["localhost", "127.0.0.1", "[::1]"].includes(s_),',
);
patch('API mesma origem', 'd0 = "https://api-referencia.invalid",', 'd0 = location.origin,');
patch(
  'segurança local autenticada',
  'if (!e.authenticated) throw new Error("Entre na sua conta para gerar o Pix.");',
  'if (!e.authenticated) throw new Error("Entre na sua conta local para simular a compra.");\n  if (e.authenticated) return "local-authenticated";',
);
replaceFunction(
  'ng',
  'function ng() { return Promise.reject(new Error("CAPTCHA externo indisponível no modo local.")); }',
);
// Promoções de canais externos não fazem parte dos resgates desta instalação.
replaceFunction('tV', 'function tV() { return ""; }');
replaceFunction('NV', 'function NV() { /* Sem service worker na reconstrução local. */ }');
replaceFunction('OV', 'function OV() { /* Sem atualizações do site original. */ }');
replaceFunction('Uv', 'function Uv() { /* Sem comunicação com service workers. */ }');
replaceFunction(
  'Fj',
  'function Fj() { return Promise.reject(new Error("YouTube indisponível no modo local; use os áudios incluídos.")); }',
);
patch('geração da consulta local', '  Qm = null;', '  Qm = null;\nlet __localPaymentEpoch = 0;');
patch(
  'cancelamento de consulta local',
  'function Zi() {\n  (clearInterval(Rx), clearInterval(Lx));',
  'function Zi() {\n  __localPaymentEpoch++;\n  (clearInterval(Rx), clearInterval(Lx));',
);
replaceFunction(
  'l0',
  `function l0(n, e) {
  Zi();
  const epoch = __localPaymentEpoch;
  const box = T("p", "sc-small", "Modo local: compra simulada gratuitamente. Consultando confirmação local…");
  let done = false, checking = false;
  const finish = (result) => {
    if (done || epoch !== __localPaymentEpoch) return;
    if (result.status === "paid") {
      done = true;
      Zi();
      box.textContent = "Compra local confirmada. Não existe cobrança real.";
      e.paid(result);
    } else if (result.status !== "pending") {
      done = true; Zi();
      box.textContent = "Simulação local expirada ou indisponível. Volte e tente novamente.";
    }
  };
  if (n.status === "paid") queueMicrotask(() => finish(n));
  else if (n.status !== "pending" || !n.ref || typeof e.check !== "function") {
    done = true;
    box.textContent = "Não foi possível confirmar a simulação local. Volte e tente novamente.";
  } else {
    const check = async () => {
      if (checking || done || epoch !== __localPaymentEpoch) return;
      checking = true;
      try { finish(await e.check(n.ref)); }
      catch {
        if (epoch !== __localPaymentEpoch) return;
        done = true; Zi();
        box.textContent = "Falha ao consultar a compra no servidor local. Volte e tente novamente.";
      } finally { checking = false; }
    };
    Rx = window.setInterval(check, 1000);
    void check();
  }
  return box;
}`,
);
patch(
  'comparação de skin persistida',
  '    t.appearance === n.appearance) ||',
  '    t.appearance === n.appearance &&\n    (t.skin ?? null) === (n.skin ?? null)) ||',
);
patch(
  'comparação de desenho persistido',
  '    (t.skin ?? null) === (n.skin ?? null)) ||',
  '    (t.skin ?? null) === (n.skin ?? null) &&\n    (t.design ?? null) === (n.design ?? null)) ||',
);
patch(
  'desenho no snapshot de entrada',
  '    appearance: e.appearance,\n    ...(qn ? { skin: qn.key } : {}),',
  '    appearance: e.appearance,\n    design: e.design ?? null,\n    ...(qn ? { skin: qn.key } : {}),',
);
patch(
  'desenho no snapshot de estilo',
  '        skin: n.skin?.key,\n        shirt: e.shirt,\n        appearance: e.appearance,',
  '        skin: n.skin?.key,\n        shirt: e.shirt,\n        appearance: e.appearance,\n        design: e.design ?? null,',
);
patch(
  'desenho no snapshot de skin',
  '      sh({\n        team: xn(i.team),\n        character: n.baseCharacter,\n        skin: n.key,\n        shirt: 0,\n        appearance: a.appearance,',
  '      sh({\n        team: xn(i.team),\n        character: n.baseCharacter,\n        skin: n.key,\n        shirt: 0,\n        appearance: a.appearance,\n        design: a.design ?? null,',
);
patch(
  'foco social e confirmação explícita de leitura',
  '  function ce(oe) {',
  `  let __localSocialFocus = "", __localSocialRead = "";
  function __localSocialSync(read = true) {
    const focused = M && !a.hidden && S === "inbox" && U && document.visibilityState !== "hidden" ? U : "";
    if (focused !== __localSocialFocus) {
      if (__localSocialFocus) L({ a: "thread_focus", uid: __localSocialFocus, on: false });
      __localSocialFocus = focused;
      __localSocialRead = "";
      if (focused) L({ a: "thread_focus", uid: focused, on: true });
    }
    if (!focused || !read) return;
    const last = K.filter((message) => message.from === focused && message.id).at(-1);
    if (last && last.id !== __localSocialRead) {
      __localSocialRead = last.id;
      L({ a: "read", uid: focused, mid: last.id });
    }
  }
  document.addEventListener("visibilitychange", () => __localSocialSync());
  n.net.addEventListener("welcome", () => {
    // Cada welcome cria um jogador sem foco no servidor; aguarde o hello da conta.
    __localSocialFocus = ""; __localSocialRead = "";
  });
  window.addEventListener("pagehide", () => {
    if (__localSocialFocus) L({ a: "thread_focus", uid: __localSocialFocus, on: false });
    __localSocialFocus = ""; __localSocialRead = "";
  });
  function ce(oe) {`,
);
patch(
  'fechar foco social',
  '    ((a.hidden = !0), e.setAttribute("aria-expanded", "false"));',
  '    ((a.hidden = !0), e.setAttribute("aria-expanded", "false"));\n    __localSocialSync();',
);
patch(
  'sincronizar conversa renderizada',
  '  function H() {\n    for (const [fe, Le] of h)',
  '  function H() {\n    __localSocialSync(false);\n    for (const [fe, Le] of h)',
);
patch(
  'confirmar leitura após renderização',
  '      Se());\n  }\n  function Z()',
  '      Se(), __localSocialSync());\n  }\n  function Z()',
);
patch(
  'abrir foco antes de carregar mensagens',
  '      L({ a: "thread", uid: oe }),\n      H());',
  '      __localSocialSync(),\n      L({ a: "thread", uid: oe }),\n      H());',
);
patch(
  'contar mensagens em conversa oculta',
  'oe.from !== y && U !== se && (C++, q())',
  'oe.from !== y && (__localSocialFocus !== se) && (C++, q())',
);
patch(
  'descartar resposta de conversa anterior',
  '      } else if (se.a === "thread") {\n        ((U = se.uid)',
  '      } else if (se.a === "thread") {\n        if (se.uid !== U) return;\n        ((U = se.uid)',
);
patch(
  'sincronizar contador confirmado',
  '      } else if (se.a === "dm" || se.a === "pending") {',
  `      } else if (se.a === "read") {
        C = Number(se.unread) || 0;
        const thread = N.find((item) => item.uid === se.uid);
        if (thread) thread.unread = 0;
        q();
      } else if (se.a === "dm" || se.a === "pending") {`,
);
patch(
  'valores simulados',
  '(n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });',
  '"Grátis · local";',
);
patch(
  'OAuth informativo',
  'r.append(T("span", "", a)),',
  'r.append(T("span", "", a)),\n        i !== "login-mail" && (r.onclick = (event) => { event.preventDefault(); ii("Modo local", T("h2", "", "Login externo indisponível"), T("p", "", "Use E-mail para criar ou entrar em uma conta armazenada neste computador. Google e Kick precisam de serviços externos.")); }),',
);
patch(
  'códigos locais de conta',
  'function Ea(n = "entrar", e = "", t = "") {',
  'const __localAuthCodes = new Map();\nfunction Ea(n = "entrar", e = "", t = "") {\n  if (["codigo", "nova"].includes(n)) t = `Código local: ${__localAuthCodes.get(e.trim().toLowerCase()) ?? "consulte o servidor local"}. Nenhum e-mail foi enviado.`;',
);
patch(
  'guardar código de autenticação',
  'const a = (r, c) => qt(r, { method: "POST", body: JSON.stringify(c) });',
  'const a = async (r, c) => { const result = await qt(r, { method: "POST", body: JSON.stringify(c) }); if (result.localCode) __localAuthCodes.set((result.email ?? c.email ?? "").trim().toLowerCase(), result.localCode); return result; };',
);
patch(
  'reenvio do código local',
  '(c.textContent = "Código reenviado"));',
  '(c.textContent = `Código local: ${__localAuthCodes.get(e.trim().toLowerCase()) ?? "indisponível"}`));',
);
patch(
  'código de recuperação visível',
  '`Se ${e} tiver conta, o código já está lá.`,',
  't || `Código local: ${__localAuthCodes.get(e.trim().toLowerCase()) ?? "indisponível"}. Nenhum e-mail foi enviado.`,',
);
// O entrypoint local fica na raiz, enquanto os módulos opcionais preservados estão em assets/.
source = source
  .replaceAll('"./livekit-client.esm-DCOkPdaM.js"', '"/assets/livekit-client.esm-DCOkPdaM.js"')
  .replaceAll('"./index-BpfooI69.js"', '"/assets/index-BpfooI69.js"')
  .replaceAll('src="https://i.ytimg.com/vi/${Ti(P.id)}/mqdefault.jpg"', 'src="/og.png"')
  .replaceAll(
    'Pix processado pela Woovi.',
    'Compra simulada gratuitamente neste computador. Sem cobrança real.',
  )
  .replaceAll('Pagamento único por Pix.', 'Compra simulada gratuita, sem pagamento real.')
  .replaceAll(
    'guardar o seu personagem, bandeiras, cartazes e veículos em qualquer aparelho.',
    'guardar o seu personagem, bandeiras, cartazes e veículos neste computador.',
  )
  .replaceAll(
    'Mandamos um código para o seu e-mail para você criar uma senha nova.',
    'O código de recuperação será exibido aqui. Nenhum e-mail é enviado no modo local.',
  )
  .replaceAll('Gerar Pix de ${Re(', 'Simular compra · ${Re(')
  .replaceAll('R$ ${Is(e).cents / 100} · permanente', 'Grátis · local · permanente')
  .replaceAll('R$10 <small>pagamento único</small>', 'Grátis <small>modo local</small>')
  .replace(/R\$\s*\d+(?:[.,]\d+)?/g, 'grátis · local')
  .replaceAll('Outro valor (R$)', 'Valor simulado')
  .replaceAll('"R$"', '"Local"')
  .replaceAll('Pagamento único', 'Simulação gratuita')
  .replaceAll('pagamento único', 'simulação gratuita')
  .replaceAll('Comprar com Pix', 'Simular compra grátis')
  .replaceAll('com Pix', 'gratuito no modo local')
  .replaceAll('por Pix', 'gratuitamente no modo local')
  .replaceAll('assim que o Pix cair', 'ao confirmar a simulação')
  .replaceAll('antes do Pix', 'antes da simulação')
  .replaceAll('Antes do Pix', 'Antes da simulação')
  .replaceAll('Gerar outro Pix', 'Simular novamente')
  .replaceAll('Ver o QR code do Pix', 'Ver a simulação local')
  .replace(/(?<!Banco do )\bPix\b/g, 'simulação local')
  .replaceAll('Premium · opcional', 'Premium · grátis localmente')
  .replaceAll('4 · PIX', '4 · SIMULAÇÃO LOCAL')
  .replaceAll(
    'Não existe cobrança, QR code ou simulação local real.',
    'Não existe cobrança ou pagamento real.',
  );
source = applyProductionClient(source);
source = applyPointsClient(source);
source = applyBrasiliaContent(applyBrasiliaSpray(applyBrasiliaScene(source)));
source = applyActivitiesDesign(source);
source = applyDesignClient(source);
source = applyAuthDesign(source);
source = applyShopDesign(source);
source = applyMediaDesign(source);
source = applySocialDesign(source);
source = applyHudDesign(source);
source = applyVoiceCopyDesign(source);
source = applyTurnstileClient(source);
source = applyCleanDesktop(source);
source = applyCleanSuperchat(source);
source = applyCleanOverlays(source);
source = applyFreeAccessClient(source);
source = applyMusicCatalog(source);
source = applySoundControlsClient(source);
source = applyAmbientPopulation(source);
source = applyAmbientAudio(source);
source = removeCrowdLoop(source);
source = applyStageVoiceClient(source);
source = applyPresenceClient(source);
source = applyMobilePerformance(source);
source = applyVehicleSeatClient(source);
source = applyPublicCopy(applyMusicPlaybackClient(source));
// O script clássico define o seletor correto antes deste módulo executar.
source = source
  .replaceAll('":popover-open"', 'window.__localPopoverSelector')
  .replaceAll(
    '".action-popover:popover-open"',
    '".action-popover" + window.__localPopoverSelector',
  );
// Defesa adicional: a política CSP do HTML impede conexões acidentais externas.
source =
  '/* Reconstrução local de compatibilidade. Base pública adaptada com identificadores editoriais omitidos. */\n' +
  source;
writePaintTerrain(source);
await fs.writeFile(path.join(root, 'public/client.js'), source);

let html = await fs.readFile(path.join(root, 'analysis/original-index.html'), 'utf8');
if (!html.includes('/assets/index-DYj4UDIq.js')) throw new Error('Entrypoint HTML inesperado');
html = html
  .replace('/assets/index-DYj4UDIq.js', '/client.js')
  .replace(
    '<script type="module" crossorigin src="/client.js">',
    '<script src="/local-compat.js"></script><script type="module" crossorigin src="/client.js">',
  )
  .replaceAll('https://referencia.invalid/', '/')
  .replace('<link rel="canonical" href="/">', '')
  .replace('<script src="/boot-check.js"></script>', '')
  .replace('<link rel="manifest" href="/site.webmanifest">', '')
  .replace(
    '<head>',
    `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: data: ws://127.0.0.1:* ws://localhost:*; img-src 'self' blob: data:; media-src 'self' blob: data:; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'">`,
  )
  .replace(
    '</head>',
    '<link rel="stylesheet" href="/local.css"><link rel="stylesheet" href="/design-entry.css"><link rel="stylesheet" href="/design-controls.css"><link rel="stylesheet" href="/design-hud.css"><link rel="stylesheet" href="/hud-clean-desktop.css"><link rel="stylesheet" href="/hud-clean-superchat.css"><link rel="stylesheet" href="/hud-clean-overlays.css"></head>',
  )
  .replaceAll(
    'Premium opcional por R$10, pagamento único.',
    'Reconstrução local com compras simuladas gratuitas.',
  )
  .replaceAll('Premium opcional, sem mensalidade.', 'Modo local, sem pagamentos reais.');
html = applyProductionHtml(brasiliaText(html));
html = allowTurnstileCsp(html);
// Metadados públicos acompanham a economia atual, sem anunciar pagamentos reais.
html = html
  .replaceAll(
    'Premium e passes opcionais.',
    'Personalize com pontos do jogo. Sem pagamentos reais.',
  )
  .replace(
    '<meta property="og:url" content="/">',
    '<meta property="og:url" content="https://manifestacoes.com/">',
  )
  .replaceAll('content="/og.png"', 'content="https://manifestacoes.com/og.png"')
  .replace(
    '"url":"/","image":"/og.png"',
    '"url":"https://manifestacoes.com/","image":"https://manifestacoes.com/og.png"',
  )
  .replace('</title>', '</title>\n<link rel="canonical" href="https://manifestacoes.com/">');
const mutableContents = new Map([
  ['/client.js', source],
  ...(await Promise.all(
    [
      'local.css',
      'design-entry.css',
      'design-controls.css',
      'design-hud.css',
      'hud-clean-desktop.css',
      'hud-clean-superchat.css',
      'hud-clean-overlays.css',
      'local-compat.js',
    ].map(async (filename) => [
      `/${filename}`,
      await fs.readFile(path.join(root, 'public', filename)),
    ]),
  )),
]);
html = versionMutableAssets(html, mutableContents);
await fs.writeFile(path.join(root, 'public/index.html'), html);
console.log(
  `Cliente local preparado: ${applied.length} patches assertivos; base adaptada e inventariada.`,
);
