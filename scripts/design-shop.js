function once(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error(`Patch de loja incompatível ou ambíguo: ${before.slice(0, 90)}`);
  }
  return source.replace(before, after);
}

/** Correções de apresentação e interação; preços e confirmação continuam no servidor. */
export function applyShopDesign(source) {
  source = applyShopAndSuperchatControls(source);
  source = once(
    source,
    '        w.items.length && (!s || !w.items.some((x) => x.key === s.key))\n          ? A(w.items[0])\n          : u());',
    '        w.items.length ? A(w.items.find((x) => x.key === s?.key) ?? w.items[0]) : u());',
  );
  source = once(
    source,
    '        } finally {\n          ((c = !1), u());',
    '        } finally {\n          if (__purchaseCycle === __shopCycle) ((c = !1), u());',
  );
  source = once(
    source,
    '    ((c.onclick = async () => {\n      ((c.disabled = !0), (r.textContent = ""));',
    '    ((c.onclick = async () => {\n      __purchaseHadFocus = document.activeElement === c;\n      ((c.disabled = !0), (r.textContent = ""));',
  );
  const purchaseError = '((r.textContent = h.message), (c.disabled = !1));';
  if (source.split(purchaseError).length !== 3)
    throw new Error('Patch de recuperação de foco da compra incompatível.');
  source = source.replaceAll(
    purchaseError,
    '((r.textContent = h.message), (c.disabled = !1), __restorePurchaseFocus());',
  );
  source = once(
    source,
    '        __superchatBusy = true;\n        t.setAttribute("aria-busy", "true");',
    '        const __superchatHadFocus = document.activeElement === A;\n        __superchatBusy = true;\n        t.setAttribute("aria-busy", "true");',
  );
  source = once(
    source,
    '          ((f.textContent = S.message), v(), w());\n        }',
    '          ((f.textContent = S.message), v(), w());\n          if (__superchatHadFocus && !A.disabled && Gi?.open && Gi.contains(t) && (document.activeElement === document.body || document.activeElement === Gi)) A.focus({ preventScroll: true });\n        }',
  );
  // Mensagem de saldo insuficiente e demais erros de resgate são anunciados.
  source = once(
    source,
    '    c.type = "button";\n    const l = () =>',
    '    c.type = "button";\n    r.setAttribute("role", "alert");\n    let __purchaseHadFocus = false;\n    const __restorePurchaseFocus = () => {\n      if (__purchaseHadFocus && !c.disabled && Gi?.open && Gi.contains(c) && (document.activeElement === document.body || document.activeElement === Gi)) c.focus({ preventScroll: true });\n    };\n    const l = () =>',
  );
  return source;
}

function applyShopAndSuperchatControls(source) {
  for (const [before, after] of [
    ['Simulação gratuita · fica na sua conta', 'Resgate com pontos · fica na sua conta'],
    ['Simulação gratuita · sem mensalidade', 'Resgate com pontos · sem mensalidade'],
    ['"Simulação gratuita"', '"Resgate com pontos"'],
    ['"Desbloquear gratuito no modo local"', '`Resgatar por ${Re(s.cents)}`'],
    [
      '    d = 0;\n  const h = () => {',
      '    d = 0;\n  let __shopLoading = false, __shopCycle = 0;\n  const h = () => {',
    ],
    ['      ((s = g), h());', '      ((s = g), h());\n      t(".skin-feature").hidden = false;'],
    [
      '(m.disabled = c || (!g && !s.enabled)),',
      '(m.disabled = c || __shopLoading || (!g && !s.enabled)),',
    ],
    [
      '    const g = ++o;\n    t(".skin-results").textContent',
      '    const g = ++o;\n    __shopLoading = true;\n    t("[data-buy]").disabled = true;\n    t(".skin-results").textContent',
    ],
    [
      '      ((t(".skin-results").textContent =\n        `${w.total}',
      '      __shopLoading = false;\n      if (!w.items.length) { s = undefined; h(); t(".skin-feature").hidden = true; }\n      ((t(".skin-results").textContent =\n        `${w.total}',
    ],
    [
      '      ((t(".skin-results").textContent = "Não foi possível carregar a loja."),',
      '      __shopLoading = false; s = undefined; h(); t(".skin-feature").hidden = true;\n      ((t(".skin-results").textContent = "Não foi possível carregar a loja."),',
    ],
    [
      '    e.addEventListener("close", h),',
      '    e.addEventListener("close", () => { o++; __shopCycle++; clearTimeout(r); h(); }),',
    ],
    ['      if (!(!g || c)) {', '      if (!(!g || c || __shopLoading)) {'],
    [
      '      const g = s;\n      if (!(!g || c || __shopLoading)) {',
      '      const g = s, __purchaseCycle = __shopCycle;\n      if (!(!g || c || __shopLoading)) {',
    ],
    [
      '          zi().includes(g.key) &&\n            (n.equip(g), e.close(), n.toast(`${g.name} selecionado.`));',
      '          if (!e.open || __purchaseCycle !== __shopCycle) return;\n          zi().includes(g.key) &&\n            (n.equip(g), e.close(), n.toast(`${g.name} selecionado.`));',
    ],
    [
      '        } catch (m) {\n          t(".skin-feedback").textContent = m.message;',
      '        } catch (m) {\n          if (!e.open || __purchaseCycle !== __shopCycle) return;\n          t(".skin-feedback").textContent = m.message;',
    ],
    [
      '        ((s = void 0), e.showModal(), f());',
      '        (__shopCycle++, (c = false), (s = void 0), e.showModal(), f());',
    ],
    [
      '      ((a = g.target.value),\n        clearTimeout(r),',
      '      __shopLoading = true; o++; t("[data-buy]").disabled = true;\n      ((a = g.target.value),\n        clearTimeout(r),',
    ],
    [
      '  t.noValidate = !0;\n  const i = T("input", "sc-input");',
      '  t.noValidate = !0;\n  let __superchatBusy = false;\n  const i = T("input", "sc-input");\n  i.setAttribute("aria-label", "Nome da sua conta");',
    ],
    [
      '  const a = T("textarea", "sc-input sc-message");',
      '  const a = T("textarea", "sc-input sc-message");\n  a.setAttribute("aria-label", "Mensagem do superchat (obrigatória)");\n  a.required = true;',
    ],
    [
      '    (a.placeholder = "Sua mensagem (opcional)"));',
      '    (a.placeholder = "Sua mensagem (obrigatória)"));',
    ],
    [
      '(u.textContent = `${c ? "A mensagem é lida em voz alta para todos na avenida." : `Só texto a partir de ${Re(n.min)}. Com voz, a partir de ${Re(n.voiceMin)}.`} Anúncio ou link: a partir de ${Re(n.adMin)}.`)',
      '(u.textContent = `Texto a partir de ${Re(n.min)}. A mensagem é obrigatória. Voz e formatos de anúncio não estão disponíveis no superchat.`)',
    ],
    [
      'Com sua conta. Aparece no topo da avenida para todos, na ordem do resgate. Antes do resgate, a mensagem passa por uma verificação automática: conteúdo explícito pesado, ódio e ameaças são recusados. A equipe pode reduzir um superchat (fica pequeno no topo, sem voz) e remover o texto que violar a lei. Benefícios usam pontos. Compra de pontos com dinheiro ainda não disponível.',
      'A mensagem de texto fica visível no topo da avenida para os jogadores. O envio usa seus pontos do jogo. Voz e moderação automática não estão disponíveis nesta versão. Para anúncios nos telões, use a opção Anúncios. Compra de pontos com dinheiro ainda não disponível.',
    ],

    [
      '  ((d.type = "number"),\n    (d.inputMode = "numeric"),',
      '  d.setAttribute("aria-label", "Quantidade personalizada de pontos");\n  l.setAttribute("role", "group"); l.setAttribute("aria-label", "Valores em pontos");\n  ((d.type = "number"),\n    (d.inputMode = "numeric"),',
    ],
    [
      '  A.type = "submit";\n  const u = T("p", "sc-hint"),',
      '  A.type = "submit";\n  h.setAttribute("role", "group"); h.setAttribute("aria-label", "Voz do superchat");\n  const u = T("p", "sc-hint"),',
    ],
    [
      '  let m = "",\n    p = "",\n    b = null;',
      '  f.setAttribute("role", "alert");\n  let m = "",\n    p = "",\n    b = null;',
    ],
    [
      '      S.classList.toggle("on", Number(S.dataset.cents) === r && !d.value);',
      '      { const selected = Number(S.dataset.cents) === r && !d.value; S.classList.toggle("on", selected); S.setAttribute("aria-pressed", String(selected)); }',
    ],
    [
      '      S.classList.toggle("on", (S.dataset.voice || null) === c);',
      '      { const selected = (S.dataset.voice || null) === c; S.classList.toggle("on", selected); S.setAttribute("aria-pressed", String(selected)); }',
    ],
    ['    ((A.disabled = !y),', '    ((A.disabled = __superchatBusy || !y),'],
    [
      '      (A.textContent = y\n        ? `Gastar ${Re(r)}`',
      '      (A.textContent = __superchatBusy ? "Validando a mensagem…" : y\n        ? `Gastar ${Re(r)}`',
    ],
    [
      '      if ((y.preventDefault(), !A.disabled)) {',
      '      if ((y.preventDefault(), !__superchatBusy && !A.disabled)) {',
    ],
    [
      '        ((A.disabled = !0),\n          (A.textContent = "Validando a mensagem…"),',
      '        __superchatBusy = true;\n        t.setAttribute("aria-busy", "true");\n        ((A.disabled = !0),\n          (A.textContent = "Validando a mensagem…"),',
    ],
    [
      '          (b && p && b.remove(p), lj(S));',
      '          if (!Gi?.open || !Gi.contains(t)) return;\n          (b && p && b.remove(p), lj(S));',
    ],
    [
      '        } catch (S) {\n          ((f.textContent = S.message), v(), w());',
      '        } catch (S) {\n          if (!Gi?.open || !Gi.contains(t)) return;\n          ((f.textContent = S.message), v(), w());',
    ],
    [
      '        if (h.status === "paid") {\n          d(h);',
      '        if (a || !Gi?.open || !Gi.contains(c)) return;\n        if (h.status === "paid") {\n          d(h);',
    ],
    [
      '      } catch (h) {\n        if (h.status === 409) {',
      '      } catch (h) {\n        if (a || !Gi?.open || !Gi.contains(c)) return;\n        if (h.status === 409) {',
    ],
    [
      '          if ((await Ds(), !n.owned().includes(e))) {',
      '          await Ds();\n          if (a || !Gi?.open || !Gi.contains(c)) return;\n          if (!n.owned().includes(e)) {',
    ],
    [
      '          ((f.textContent = S.message), v(), w());\n        }',
      '          __superchatBusy = false; t.setAttribute("aria-busy", "false");\n          ((f.textContent = S.message), v(), w());\n        }',
    ],
  ])
    source = once(source, before, after);
  return source;
}
