import { replaceOnce } from './points-patches.js';
import { pointsRuntime } from './points-runtime.js';
import { applySimpleMediaClient } from './points-media-client.js';
export { designPricingRuntime, pointsRuntime } from './points-runtime.js';
export { simpleAdsRuntime } from './points-ads-runtime.js';

/** Aplica a moeda de jogo ao adaptador; os nomes legados cents não mudam o contrato. */
export function applyPointsClient(source) {
  source = replaceOnce(
    source,
    'const Re = (n) =>\n  "Grátis · beta";',
    pointsRuntime + '\nconst Re = __formatPoints;',
  );
  source = replaceOnce(
    source,
    't ?? e.querySelector("span")?.textContent ?? e.textContent ?? e.title,',
    '__menuActionLabel(e, t),',
  );
  source = replaceOnce(
    source,
    '(i.innerHTML = e.querySelector("svg")?.outerHTML ?? I3.actions),',
    '(i.innerHTML = e.querySelector("svg")?.outerHTML ?? I3.actions),\n      i.setAttribute("aria-label", __menuActionLabel(e, t)),',
  );
  source = replaceOnce(
    source,
    'const post = (path, body) => qt(path, { method: "POST", body: JSON.stringify(body) });',
    'const post = (path, body) => qt(path, { method: "POST", body: JSON.stringify(__withReferral(path, body)) });',
  );
  source = replaceOnce(
    source,
    'await post("/api/auth/email/verify", { email, code: code.value.trim() });',
    'await post("/api/auth/email/verify", { email, code: code.value.trim() });\n    __clearReferral();',
  );
  source = replaceOnce(
    source,
    'n.topActions.append(e));',
    'n.topActions.append(__pointsButton("account-btn points-top"), e));',
  );
  source = replaceOnce(source, 'g.append(w, x),', 'g.append(__pointsButton(), w, x),');
  source = replaceOnce(
    source,
    '(n / 100).toLocaleString("pt-BR", {\n      minimumFractionDigits: 2,\n      maximumFractionDigits: 2,\n    });',
    'Math.max(0, Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });',
  );
  source = replaceOnce(source, '(a.placeholder = "0,00"),', '(a.placeholder = "0"),');
  source = replaceOnce(
    source,
    'i.append(T("span", "telao-rs", "Local"), a),',
    'i.append(T("span", "telao-rs", "Pontos"), a),',
  );
  source = replaceOnce(
    source,
    '(d.inputMode = "decimal"),\n    (d.min = String(n.min / 100)),\n    (d.max = String(n.max / 100)),\n    (d.step = "0.01"),\n    (d.placeholder = "Valor simulado"));',
    '(d.inputMode = "numeric"),\n    (d.min = String(n.min)),\n    (d.max = String(n.max)),\n    (d.step = "1"),\n    (d.placeholder = "Quantidade de pontos"));',
  );
  source = replaceOnce(
    source,
    '((r = Math.round(Number(d.value.replace(",", ".")) * 100) || 0), w());',
    '((r = /^[0-9]+$/.test(d.value) && Number.isSafeInteger(Number(d.value)) ? Number(d.value) : 0), w());',
  );
  source = replaceOnce(
    source,
    'function No() {',
    'function No() {\n  if (qi?.rules?.biddingEnabled === false) return __pointsAdPreparation();',
  );
  source = replaceOnce(
    source,
    'async function M4(n, e) {',
    'async function M4(n, e) {\n  if (qi?.rules?.biddingEnabled === false) return __pointsAdPreparation();',
  );
  source = replaceOnce(
    source,
    '  (e.history.length && o.push(T("p", "sc-label", "ÚLTIMOS ANUNCIANTES"), a),',
    '  if (qi?.rules?.biddingEnabled === false) { s.disabled = true; s.textContent = "Lances em preparação"; }\n  (e.history.length && o.push(T("p", "sc-label", "ÚLTIMOS ANUNCIANTES"), a),',
  );
  source = replaceOnce(
    source,
    '  if (!n.signedIn || !gn()) {',
    '  if (n.rules?.biddingEnabled === false) return __pointsAdPreparation();\n  if (!n.signedIn || !gn()) {',
  );
  source = replaceOnce(
    source,
    '!i.boostOf && ["live", "queued"].includes(i.status)',
    'qi?.rules?.biddingEnabled !== false && !i.boostOf && ["live", "queued"].includes(i.status)',
  );
  source = replaceOnce(
    source,
    '...yd.map((n) => ({ id: n.id, key: n.key, name: n.name, handheld: n.key }))',
    '...yd.map((n) => ({ id: n.id, key: n.key, name: n.name, handheld: n.key, price: 50 }))',
  );
  source = applyPointsCopy(source);
  source = applySimpleMediaClient(source);
  return source;
}

function applyPointsCopy(source) {
  // Todos os botões de aquisição mostram o preço real devolvido pelo catálogo.
  source = source
    .replaceAll('Simular compra · ${Re(', 'Gastar ${Re(')
    .replaceAll('Simular compra grátis', 'Usar pontos')
    .replaceAll('Levar sem pagar', 'Resgatar benefício')
    .replaceAll(
      'Compra simulada gratuita, sem pagamento real.',
      'O valor em pontos será descontado do seu saldo ao confirmar.',
    )
    .replaceAll(
      'Beta gratuito. Nenhuma cobrança ou pagamento real.',
      'Benefícios usam pontos. Compra de pontos com dinheiro ainda não disponível.',
    )
    .replaceAll(
      'Beta gratuito: ativando benefício. Não há pagamento real…',
      'Confirmando o resgate com pontos…',
    )
    .replaceAll(
      'Benefício gratuito ativado. Não existe cobrança real.',
      'Resgate com pontos confirmado.',
    )
    .replaceAll('Simulação local expirada ou indisponível.', 'Resgate expirado ou indisponível.')
    .replaceAll(
      'Não foi possível confirmar a simulação local.',
      'Não foi possível confirmar o resgate com pontos.',
    )
    .replaceAll('Simular novamente', 'Tentar novamente')
    .replaceAll('Ver a simulação local', 'Ver resgate com pontos')
    .replaceAll(
      '${__loopbackClient ? "Grátis · beta · permanente" : "Conta confirmada necessária"}',
      'Resgate com pontos · permanente',
    )
    .replaceAll('Premium · beta gratuito', 'Premium · pontos')
    .replaceAll(
      'Grátis <small>beta gratuito</small>',
      '${Re(h0())} <small>resgate com pontos</small>',
    )
    .replaceAll('Aumente pelo menos grátis · beta', 'Aumente pelo menos 100 pontos')
    .replaceAll(
      'Você aumenta o lance que já existe e paga somente a diferença. Exemplo: de grátis · beta para grátis · beta, o complemento é grátis · beta.',
      'Você aumenta o lance e gasta somente a diferença em pontos.',
    )
    .replaceAll('Nada comprado ainda.', 'Nenhum benefício resgatado ainda.')
    .replaceAll('Mande um superchat gratuito no modo local', 'Envie um superchat com seus pontos')
    .replaceAll(
      'Mande um superchat gratuito no modo local (o selo ★ fica na sua conta)',
      'Envie um superchat com seus pontos (o selo ★ fica na sua conta)',
    )
    .replaceAll(
      'Entre na sua conta para continuar com o pagamento gratuitamente no modo local.',
      'Entre na sua conta para enviar um superchat usando pontos.',
    )
    .replaceAll('Sem conta. Aparece no topo', 'Com sua conta. Aparece no topo')
    .replaceAll('Pago! Obrigado pelo apoio', 'Pontos usados! Obrigado pelo apoio')
    .replaceAll('simulação gratuita', 'resgate em pontos')
    .replaceAll('gratuitamente no modo local', 'com pontos')
    .replaceAll('benefícios gratuitos de conta', 'benefícios com pontos')
    .replaceAll(
      'benefícios gratuitos para contas confirmadas',
      'benefícios para contas confirmadas',
    )
    .replaceAll(
      'Bandeiras, skins e veículos premium são benefícios gratuitos de conta.',
      'Bandeiras, skins e veículos premium podem ser resgatados com pontos.',
    )
    .replaceAll(
      'Benefícios de conta são gratuitos nesta instalação.',
      'Use pontos para resgatar benefícios de conta.',
    )
    .replaceAll('simulação local', 'resgate com pontos')
    .replaceAll('ao confirmar a simulação', 'ao confirmar o gasto de pontos')
    .replaceAll('antes da simulação', 'antes do resgate')
    .replaceAll('Antes da simulação', 'Antes do resgate')
    .replaceAll('na ordem do pagamento', 'na ordem do resgate')
    .replaceAll(
      'O pagamento só é liberado após a aprovação',
      'O resgate só é liberado após a aprovação',
    )
    .replaceAll(
      'Os pagamentos estão fora do ar agora.',
      'Os resgates de pontos estão indisponíveis agora.',
    )
    .replaceAll('grátis · beta', 'pontos · veja a loja')
    .replaceAll('resgate em pontos com pontos', 'resgate em pontos')
    .replaceAll('pagamentos', 'resgates de pontos')
    .replaceAll('pagamento', 'resgate de pontos')
    .replaceAll('o resgate de pontos do resgate com pontos', 'o resgate com pontos');
  return source;
}
