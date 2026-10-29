export const simpleAdsRuntime = String.raw`
function __adViewCurrent(node) { return node.isConnected && node.closest("dialog")?.open === true; }
function __adRules() { return "100 pontos por telão durante 24 horas. Todos os anúncios ativos alternam igualmente, sem leilão ou impulsos. O envio é gratuito; o saldo só é descontado ao publicar."; }
function __simpleAds() {
  Zi(); ah();
  const nodes = [T("h2", "", "Telões de Brasília"), T("p", "", __adRules())];
  const summary = T("p", "", ""); summary.setAttribute("role", "status"); summary.setAttribute("aria-live", "polite");
  const proceed = St("primary", "Continuar", () => void Va());
  const update = () => { summary.textContent = he.selected.size + (he.selected.size === 1 ? " telão · " : " telões · ") + __formatPoints(he.selected.size * 100) + " · 24 horas"; proceed.disabled = !he.selected.size; };
  const list = T("div", "telao-list");
  for (const screen of Gr()) {
    const row = T("label", "telao-card");
    const input = T("input"); input.type = "checkbox"; input.checked = he.selected.has(screen.id);
    input.setAttribute("aria-label", "Selecionar " + screen.name);
    input.onchange = () => { input.checked ? he.selected.add(screen.id) : he.selected.delete(screen.id); update(); };
    row.append(input, T("span", "", screen.name + " · " + screen.aspect), T("b", "", "100 pontos / 24h"));
    list.append(row);
  }
  nodes.push(...__simpleOwnedAds(), list, summary, proceed, St("account-btn link", "Voltar ao jogo", ro));
  la(...nodes); update();
}
function __adTimestamp(value) { const date = new Date(value ?? NaN).getTime(); return Number.isFinite(date) ? date : 0; }
function __adCreatedAt(item) { return __adTimestamp(item.createdAt) || __adTimestamp(item.created); }
function __simpleOwnedAds(screenId) {
  const matching = (qi?.mine?.bids ?? []).filter(bid => !screenId || bid.screen === screenId);
  const newest = (left, right) => __adCreatedAt(right) - __adCreatedAt(left);
  const active = matching.filter(bid => ["live", "queued", "pending"].includes(bid.status)).sort(newest).slice(0, 100);
  const history = matching.filter(bid => !["live", "queued", "pending"].includes(bid.status)).sort(newest).slice(0, 50);
  const mine = [...active, ...history];
  if (!mine.length) return [];
  const list = T("ul", "account-owned");
  for (const bid of mine) {
    const screen = Gr().find(item => item.id === bid.screen);
    const expiry = __adTimestamp(bid.expiresAt) ? new Date(bid.expiresAt).toLocaleString("pt-BR") : "";
    list.append(T("li", "", (screen?.name ?? bid.screen) + " · " + ({ live: "Em rotação", queued: "Na fila", pending: "Em processamento", expired: "Encerrado", cancelled: "Cancelado", lost: "Encerrado" }[bid.status] ?? "Indisponível") + (expiry ? " · até " + expiry : "")));
  }
  const controls = [];
  const references = [...new Set(mine.filter(bid => bid.status === "live" && bid.pricingMode === "fixed" && bid.ref).map(bid => bid.ref))];
  for (const reference of references) {
    const campaign = matching.filter(bid => bid.ref === reference && bid.status === "live");
    const names = [...new Set(campaign.map(bid => Gr().find(screen => screen.id === bid.screen)?.name ?? bid.screen))];
    const description = names[0] + (names.length > 1 ? " e mais " + (names.length - 1) + (names.length === 2 ? " telão" : " telões") : "");
    controls.push(St("account-btn link", "Cancelar campanha: " + description + " · devolver pontos pelo tempo restante", () => {
    const warning = T("p", "", "Ao cancelar, todos os telões desta campanha saem da rotação. Os pontos são devolvidos proporcionalmente ao tempo restante, uma única vez.");
    const status = T("p", "sc-error"); status.setAttribute("role", "status");
    const confirm = St("primary", "Confirmar cancelamento", async () => {
      if (confirm.disabled) return;
      confirm.disabled = true;
      try { const result = await qt(an + "/telao/cancelar", { method: "POST", body: JSON.stringify({ ref: reference }) }); await tr(); await _a(); if (!__adViewCurrent(status)) return; la(T("h2", "", "Campanha cancelada"), T("p", "", "Devolução: " + __formatPoints(result.refundedPoints ?? 0)), St("primary", "Ver anúncios", No)); }
      catch (error) { if (!__adViewCurrent(status)) return; status.textContent = error.message; confirm.disabled = false; }
    });
    la(T("h2", "", "Cancelar campanha?"), warning, status, confirm, St("account-btn link", "Manter campanha", No));
  }));
  }
  return [T("h3", "", "Seus anúncios"), list, ...controls];
}
function __deleteAdMedia(item) {
  const status = T("p", "", "A exclusão libera espaço para novos arquivos. Mídias usadas em anúncios ativos não podem ser excluídas."); status.setAttribute("role", "status");
  const confirm = St("primary", "Confirmar exclusão da mídia", async () => {
    if (confirm.disabled || !__adViewCurrent(status)) return;
    confirm.disabled = true;
    try {
      const result = await qt(an + "/telao/midia?id=" + encodeURIComponent(item.id), { method: "DELETE" });
      await _a();
      if (!__adViewCurrent(status)) return;
      la(T("h2", "", "Mídia excluída"), T("p", "", result.cleanupPending ? "Mídia removida da biblioteca. A limpeza do arquivo está pendente; o espaço ainda pode permanecer ocupado." : "O espaço foi liberado para novos arquivos."), St("primary", "Voltar aos anúncios", () => void __simpleAdOrder()));
    } catch (error) { if (!__adViewCurrent(status)) return; status.textContent = error.message; confirm.disabled = false; }
  });
  la(T("h2", "", "Excluir mídia?"), status, confirm, St("account-btn link", "Manter mídia", () => void __simpleAdOrder()));
}
async function __simpleAdOrder() {
  Zi(); ah();
  const loading = T("p", "", "Consultando telões…"); loading.setAttribute("role", "status");
  la(T("h2", "", "Publicar anúncio"), loading, St("account-btn link", "Escolher telões", No));
  let panel;
  try { panel = await _a(); }
  catch (error) { if (__adViewCurrent(loading)) loading.textContent = error.message; return; }
  if (!__adViewCurrent(loading)) return;
  if (!panel) return Fu("Telões indisponíveis", "Não foi possível consultar os telões.", () => void Jc());
  if (!gn() || !panel.signedIn) return Ea("entrar");
  const screens = Gr().filter(screen => he.selected.has(screen.id));
  if (!screens.length) return No();
  const aspects = [...new Set(screens.map(screen => screen.aspect))];
  const nodes = [T("h2", "", "Publicar anúncio por 24 horas"), T("p", "", screens.map(screen => screen.name).join(", ")), T("p", "", __adRules()), T("b", "", "Total: " + __formatPoints(screens.length * 100))];
  const status = T("p", "sc-small", "Escolha uma imagem PNG, JPEG ou WebP estática. A validação do arquivo é técnica; publique apenas conteúdo que você pode usar."); status.setAttribute("role", "status");
  const file = T("input", "sc-input"); file.type = "file"; file.accept = "image/png,image/jpeg,image/webp"; file.setAttribute("aria-label", "Imagem do anúncio");
  const newRequestId = () => globalThis.crypto?.randomUUID?.() ?? ("ad_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2));
  let media = null, busy = false, requestId = newRequestId();
  const publish = St("primary", "Publicar 24h · " + __formatPoints(screens.length * 100), async () => {
    if (busy || !media || !__adViewCurrent(status)) return;
    busy = true; publish.disabled = file.disabled = true;
    try {
      const ids = Object.values(media.copies ?? {}).filter(Boolean);
      const result = await qt(an + "/telao/lance", { method: "POST", body: JSON.stringify({ items: screens.map(screen => ({ screen: screen.id, cents: 100 })), media: ids.length ? ids : [media.id], requestId }) });
      if (result.status !== "paid" && !result.paid) throw new Error("O servidor não confirmou a publicação.");
      await tr(); await _a();
      if (!__adViewCurrent(status)) return;
      la(T("h2", "", "Anúncio publicado"), T("p", "", "Seu anúncio participa da rotação dos telões escolhidos durante 24 horas."), T("p", "", "Resgate: " + __formatPoints(result.points ?? result.cents)), St("primary", "Ver meus anúncios", No));
    } catch (error) { if (!__adViewCurrent(status)) return; status.textContent = error.message; busy = false; publish.disabled = !media; file.disabled = false; }
  });
  publish.disabled = true;
  file.onchange = async () => {
    if (busy) return;
    const selected = file.files?.[0]; media = null; publish.disabled = true;
    if (!selected) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(selected.type)) { status.textContent = "Use somente PNG, JPEG ou WebP estática."; return; }
    if (!selected.size || selected.size > (panel.rules?.maxMB ?? 20) * 1048576) { status.textContent = "Arquivo vazio ou maior que o limite permitido."; return; }
    busy = true; file.disabled = true; status.textContent = "Enviando e validando imagem…";
    try {
      const response = await fetch(an + "/telao/midia?aspect=" + encodeURIComponent(aspects.join(",")), { method: "POST", credentials: "same-origin", headers: { "content-type": selected.type }, body: selected });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar a imagem.");
      if (data.status !== "approved") throw new Error(data.reason || "Imagem ainda não liberada para publicação.");
      media = data; requestId = newRequestId(); status.textContent = "Imagem validada. Confira o total e confirme a publicação com pontos.";
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; file.disabled = false; publish.disabled = !media; }
  };
  const preview = St("account-btn", "Ver anúncio no cenário 3D", () => { if (!busy && media) { w4(); he.media = media; he.kind = media.kind; he.index = 0; Bj(); } });
  const library = Cj(panel, aspects);
  for (const item of library) nodes.push(St("account-btn", "Usar anúncio aprovado" + (__adCreatedAt(item) ? " de " + new Date(__adCreatedAt(item)).toLocaleDateString("pt-BR") : ""), () => { if (!busy) { media = item; requestId = newRequestId(); publish.disabled = false; status.textContent = "Anúncio aprovado selecionado. Confira o total e publique."; } }), St("account-btn link", "Excluir mídia aprovada", () => { if (!busy) __deleteAdMedia(item); }));
  nodes.push(file, status, preview, publish, St("account-btn link", "Escolher telões", No)); la(...nodes);
}
`;
