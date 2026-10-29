import { replaceOnce, replaceRegion } from './points-patches.js';
import { simpleAdsRuntime } from './points-ads-runtime.js';
import { designPricingRuntime } from './points-runtime.js';

export function applySimpleMediaClient(source) {
  const textureAnchor =
    '            ((s.colorSpace = gt),\n              this.cover(s, s.image.width, s.image.height, e.def),';
  if (source.split(textureAnchor).length !== 3)
    throw new Error('Loaders de imagem dos telões incompatíveis');
  source = source.replaceAll(
    textureAnchor,
    '            (__limitScreenTexture(s), (s.colorSpace = gt),\n              this.cover(s, s.image.width, s.image.height, e.def),',
  );
  source = replaceOnce(source, '(a.playlist = t.slice(0, 5))', '(a.playlist = t.slice(0, 50))');
  source = replaceOnce(source, 'function No() {', simpleAdsRuntime + '\nfunction No() {');
  source = replaceRegion(
    source,
    'function No() {',
    'function VS(',
    'function No() { return __simpleAds(); }',
  );
  source = replaceRegion(
    source,
    'function VS(',
    'async function ih(',
    'function VS(n) { return __simpleOwnedAds(n); }',
  );
  source = replaceRegion(
    source,
    'async function ih(',
    'function jS(',
    'async function ih(n) { const screen = Gr().find(item => item.id === n); if (!screen) return Jc(); la(T("h2", "", screen.name), T("p", "", __adRules()), ...__simpleOwnedAds(n), St("primary", "Anunciar neste telão", () => { he.selected.clear(); he.selected.add(n); void Va(); }), St("account-btn link", "Todos os telões", No)); }',
  );
  source = replaceRegion(
    source,
    'async function M4(',
    'async function Va(',
    'async function M4() { return Jc(); }',
  );
  source = replaceRegion(
    source,
    'async function Va(',
    'function kj(',
    'async function Va() { return __simpleAdOrder(); }',
  );
  source = replaceRegion(
    source,
    'function jS(',
    'const Mj =',
    'function jS() { return T("p", "sc-small", __adRules()); }',
  );
  source = applyMediaLabels(source);
  return applyMediaPurchase(source);
}

function applyMediaLabels(source) {
  source = source
    .replaceAll(
      'Novos uploads estão temporariamente indisponíveis.',
      'Crie cartazes e bandeiras e publique anúncios com pontos.',
    )
    .replaceAll(
      'Use seu e-mail e um código de 6 dígitos para guardar benefícios para contas confirmadas.',
      'Entre por e-mail para guardar seu progresso e usar pontos em benefícios.',
    )
    .replaceAll('Liberado pela equipe: grátis', 'Design adquirido')
    .replaceAll(
      'Cartazes de uso ilimitado · até 20 salvos',
      'Designs próprios por 100 pontos · até 20 salvos',
    )
    .replaceAll(
      'Cartazes: uso ilimitado, até 20 salvos',
      'Designs próprios: 100 pontos por design, até 20 salvos',
    )
    .replaceAll(
      'Toda a garagem e cartazes ilimitados.',
      'Toda a garagem. Designs próprios por 100 pontos cada.',
    )
    .replaceAll(
      'Bandeiras e personalizações ilimitadas',
      'Bandeiras incluídas; designs próprios por 100 pontos',
    )
    .replaceAll(
      'Cartazes sem cobrança por criação: até 20 salvos, com uso ilimitado.',
      'Cada design de cartaz ou bandeira custa 100 pontos para ativar, inclusive para Premium, salvo recompensa de missão: até 20 salvos, com uso ilimitado após adquirir.',
    )
    .replaceAll(
      'Premium ativo. Seus benefícios anteriores estão preservados. Cartazes incluídos disponíveis: ${l.posters.remaining} de ${l.posters.total}.',
      'Premium ativo. Seus benefícios anteriores estão preservados. Designs próprios custam 100 pontos cada, salvo recompensa de missão, e podem ser usados ilimitadamente após adquirir.',
    )
    .replaceAll(
      'Ilimitados · incluídos no passe, após aprovação',
      'Designs próprios: 100 pontos cada, até 20 salvos',
    )
    .replaceAll('Cartazes e bandeiras liberados: grátis', 'Designs próprios: 100 pontos cada')
    .replaceAll(
      'Abra Meus cartazes para criar sem pagar resgate com pontos.',
      'Abra Meus cartazes: a recompensa permite criar e ativar designs sem gastar pontos.',
    )
    .replaceAll(
      'Cartazes passam por aprovação; anúncios, doações e superchats são compras separadas.',
      'Cada design de cartaz ou bandeira custa 100 pontos para ativar. Anúncios, doações e superchats usam pontos separadamente.',
    );
  return source;
}

function applyMediaPurchase(source) {
  source = source
    .replaceAll(
      'if (n === "cartaz" && !$i()) {\n    bd();\n    return;\n  }',
      'if (!gn()) { Ea("entrar"); return; }',
    )
    .replaceAll('if (ee.dataset.kind === "cartaz" && !$i()) {', 'if (!gn()) {')
    .replaceAll('if ((H3(t), t.kind === "cartaz" && !$i())) {', 'if ((H3(t), !gn())) {')
    .replaceAll('(h.close(), bd());', '(h.close(), Ea("entrar"));')
    .replaceAll(
      'A imagem passa por aprovação, sem cobrança por cartaz.',
      'A imagem passa por validação técnica. ${er(n)}.',
    )
    .replaceAll(
      'Só Premium pode criar cartazes: até 20 salvos, de uso ilimitado.',
      'Contas confirmadas podem criar cartazes: 100 pontos por design, até 20 salvos e uso ilimitado.',
    );
  source = replaceRegion(
    source,
    'const V6 = (n) =>',
    'function EV(',
    'const V6 = () => __designPriceLabel();',
  );
  source = replaceOnce(
    source,
    'function gg(n) {\n  return n.kind === "cartaz"\n    ? $i()\n      ? qt(`${an}/cartaz/ativar`, {\n          method: "POST",\n          body: JSON.stringify({ id: n.id }),\n        }).then((e) => (ts(e.account), Vc()))\n      : (bd(), Promise.resolve(null))\n    : new Promise((e) => {',
    'function gg(n) {\n  return new Promise((e) => {',
  );
  source = replaceOnce(
    source,
    'h = async () => {\n            ((c.disabled = !0), (r.textContent = ""));\n            try {\n              const A = await qt(`${an}/cartaz/comprar`, {',
    'h = async () => {\n            if (c.disabled || t || !Gi?.open || !Gi.contains(c)) return;\n            ((c.disabled = !0), (r.textContent = ""));\n            try {\n              const A = await qt(`${an}/cartaz/comprar`, {',
  );
  source = replaceOnce(
    source,
    '              (s && A.status !== "paid" && tr(),',
    '              if (t || !Gi?.open || !Gi.contains(c)) return;\n              (s && A.status !== "paid" && tr(),',
  );
  source = replaceOnce(
    source,
    '            } catch (A) {\n              if (A.status === 409 && /já é seu/.test(A.message))\n                return (\n                  await Ds(),\n                  o({ ref: "", cents: n.cents, id: n.id, account: xt })\n                );',
    '            } catch (A) {\n              if (t || !Gi?.open || !Gi.contains(c)) return;\n              if (A.status === 409 && /já é seu/.test(A.message)) {\n                await Ds();\n                if (t || !Gi?.open || !Gi.contains(c)) return;\n                return o({ ref: "", cents: n.cents, id: n.id, account: xt });\n              }',
  );
  source = replaceOnce(
    source,
    'ee.included ? "incluído no Premium" : "liberado pela equipe"',
    'ee.included ? "recompensa de missão" : "sem custo"',
  );
  source = source.replaceAll(
    'A equipe confere antes, como sempre; aprovado, fica na sua conta sem resgate com pontos.',
    'A imagem passa por validação técnica; a recompensa de missão permite ativar sem gastar pontos.',
  );
  // Premium mantém seu preço próprio; a missão designs libera apenas as mídias personalizadas.
  source = replaceRegion(
    source,
    'function Br(n) {',
    'function sf()',
    designPricingRuntime + '\nfunction Br() { return __designsFree(); }',
  );
  source = replaceRegion(
    source,
    'function er(n) {',
    'let qx =',
    'function er() { return __designPriceLabel() + " · uso ilimitado após ativar"; }',
  );
  return source;
}
