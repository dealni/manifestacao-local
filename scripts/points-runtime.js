/** O prêmio de missão é independente do Premium e respeita o preço efetivo do servidor. */
export const designPricingRuntime = String.raw`
function __designsFree() {
  return !!xt?.user && (xt.user.designsFree === true || xt.media?.designPoints === 0);
}
function __designPoints() {
  const price = xt?.media?.designPoints;
  return __designsFree() ? 0 : Number.isSafeInteger(price) && price > 0 ? price : 100;
}
function __designPriceLabel() {
  return __designsFree() ? "Sem custo · recompensa de missão" : __formatPoints(__designPoints()) + " por design";
}
`;

/** Código executado antes do login: o convite sobrevive à troca de e-mail e ao reenvio. */
export const pointsRuntime = String.raw`
function __formatPoints(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return "Indisponível";
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount.toLocaleString("pt-BR") + (amount === 1 ? " ponto" : " pontos") : "Indisponível";
}
function __menuActionLabel(element, preferred) {
  const options = [preferred, element.getAttribute?.("aria-label"), element.querySelector?.("span")?.textContent, element.textContent, element.title];
  return options.find(value => typeof value === "string" && value.trim())?.trim() || "Ação do jogo";
}
function __limitScreenTexture(texture) {
  const image = texture?.image;
  const width = Number(image?.width), height = Number(image?.height);
  if (!(width > 0 && height > 0) || Math.max(width, height) <= 1024) return;
  try {
    const canvas = document.createElement("canvas");
    const scale = 1024 / Math.max(width, height);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    texture.image = canvas; texture.needsUpdate = true;
  } catch {}
}
const __referralStorageKey = "brasilia-referral";
function __validReferral(code) { return typeof code === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(code); }
let __capturedReferral = "";
try {
  const incoming = new URLSearchParams(location.search).get("convite");
  const stored = sessionStorage.getItem(__referralStorageKey);
  __capturedReferral = __validReferral(incoming) ? incoming : __validReferral(stored) ? stored : "";
  if (__capturedReferral) sessionStorage.setItem(__referralStorageKey, __capturedReferral);
} catch {
  try { const incoming = new URLSearchParams(location.search).get("convite"); if (__validReferral(incoming)) __capturedReferral = incoming; } catch {}
}
function __withReferral(path, body) {
  return __capturedReferral && (path === "/api/auth/email/request" || path === "/api/auth/email/verify") ? { ...body, referralCode: __capturedReferral } : body;
}
function __clearReferral() {
  __capturedReferral = "";
  try { sessionStorage.removeItem(__referralStorageKey); } catch {}
}
function __pointsButton(className = "account-btn") {
  const button = T("button", className, "Pontos e convites");
  button.type = "button";
  button.setAttribute("aria-label", "Ver saldo de pontos e convidar amigos");
  button.onclick = () => { document.querySelector("#account-pop")?.close(); void __openPoints(); };
  return button;
}
async function __openPoints() {
  if (!gn()) return Ea("entrar");
  const accountId = gn().id;
  const marker = T("p", "sc-small", "Consultando seu saldo…");
  marker.setAttribute("role", "status");
  ii("PONTOS E CONVITES", T("h2", "", "Seus pontos"), marker);
  try {
    const wallet = await qt("/api/jogos/manifestacao/pontos");
    if (!Gi?.open || !Gi.contains(marker) || !gn() || gn().id !== accountId) return;
    const balance = T("p", "account-pop-status", "Saldo: " + __formatPoints(wallet.balance));
    balance.setAttribute("role", "status");
    const nodes = [T("h2", "", "Pontos e convites"), balance,
      T("p", "sc-small", "Use seus pontos nos benefícios do jogo. Pontos não são dinheiro, não permitem saque e a compra de pontos ainda não está disponível.")];
    const referral = wallet.referral;
    if (referral && __validReferral(referral.code)) {
      nodes.push(T("h3", "", "Convide amigos"));
      nodes.push(T("p", "", "Quando uma nova conta entra pelo seu convite e confirma o e-mail e escolhe um apelido, você ganha " + __formatPoints(referral.inviterReward) + " e seu amigo ganha " + __formatPoints(referral.inviteeReward) + " extras. Seu prêmio vale para até " + Math.max(0, Number(referral.maxRewards) || 0) + " convites; depois desse limite, novos convidados ainda recebem o bônus. Não vale para contas existentes nem para convidar a si mesmo."));
      nodes.push(T("p", "sc-small", "Bônus inicial ao confirmar e-mail e apelido (inclusive contas existentes): " + __formatPoints(wallet.welcomePoints) + ". Convites premiados: " + Math.max(0, Number(referral.rewardedInvites) || 0) + "/" + Math.max(0, Number(referral.maxRewards) || 0) + "."));
      const link = T("input", "sc-input");
      link.type = "url"; link.readOnly = true;
      link.value = new URL("/?convite=" + encodeURIComponent(referral.code), location.origin).href;
      link.setAttribute("aria-label", "Seu link de convite");
      const status = T("p", "sc-small"); status.setAttribute("role", "status");
      const copy = T("button", "primary", "Copiar convite"); copy.type = "button";
      const current = () => Gi?.open && Gi.contains(link) && gn()?.id === accountId;
      copy.onclick = async () => {
        if (!current()) return;
        try { if (!navigator.clipboard?.writeText) throw new Error("Clipboard indisponível"); await navigator.clipboard.writeText(link.value); if (current()) status.textContent = "Convite copiado!"; }
        catch { if (!current()) return; link.focus(); link.select(); status.textContent = "Selecione e copie o link acima."; }
      };
      nodes.push(link, copy, status);
    }
    const ledger = Array.isArray(wallet.ledger) ? wallet.ledger.slice(0, 10) : [];
    if (ledger.length) {
      nodes.push(T("h3", "", "Últimas movimentações"));
      const list = T("ul", "account-owned");
      for (const entry of ledger) {
        const amount = Number(entry.amount);
        if (!Number.isSafeInteger(amount) || !amount) continue;
        const labels = { welcome: "Boas-vindas", referral_inviter: "Amigo convidado", referral_invited: "Bônus de convite", referral_invitee: "Bônus de convite", purchase: "Benefício no jogo", design: "Design personalizado", screen_campaign: "Anúncio nos telões", screen_cancel: "Devolução de anúncio", superchat: "Superchat" };
        const label = labels[entry.reason ?? entry.type] || (String(entry.reason ?? "").startsWith("purchase:") ? "Benefício no jogo" : "Movimentação de pontos");
        const item = T("li"); item.append(T("b", "", entry.direction === "debit" || amount < 0 ? "−" : "+"), T("span", "", label + ": " + __formatPoints(Math.abs(amount)))); list.append(item);
      }
      nodes.push(list);
    }
    nodes.push(Zr("Voltar ao jogo", ro));
    ii("PONTOS E CONVITES", ...nodes);
  } catch (error) {
    if (Gi?.open && Gi.contains(marker) && gn()?.id === accountId) ii("PONTOS E CONVITES", T("h2", "", "Não foi possível consultar os pontos"), T("p", "sc-error", error.message), Zr("Tentar novamente", () => void __openPoints()));
  }
}
function __pointsAdPreparation() {
  const list = T("ul", "account-owned");
  for (const screen of Gr()) {
    const row = T("li");
    const details = St("account-btn link", "Detalhes de " + screen.name, () => void ih(screen.id));
    row.append(T("span", "", screen.name), details); list.append(row);
  }
  la(T("h2", "", "Anúncios em preparação"), T("p", "", "Os telões e seus conteúdos continuam disponíveis no cenário. Novos lances e impulsos estão em preparação; nenhum ponto será descontado. Compra de pontos com dinheiro ainda não disponível."), list, St("account-btn link", "Voltar ao jogo", ro));
}

`;
