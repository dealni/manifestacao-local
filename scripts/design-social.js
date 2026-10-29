/** Ajustes locais do painel social, preservando o protocolo e os ACKs existentes. */
export function applySocialDesign(source) {
  const start = source.indexOf('function nj(n) {');
  const end = source.indexOf('\n}', start) + 2;
  if (start < 0 || end <= start) throw new Error('Painel social incompatível');
  let panel = source.slice(start, end);
  const replace = (before, after) => {
    if (!panel.includes(before) || panel.indexOf(before) !== panel.lastIndexOf(before)) {
      throw new Error(`Patch social incompatível ou ambíguo: ${before.slice(0, 70)}`);
    }
    panel = panel.replace(before, after);
  };
  // Estes são filtros com botões pressionados, não tabs ou menus ARIA.
  replace(
    'd.setAttribute("role", "tablist");',
    'd.setAttribute("role", "group");\n  d.setAttribute("aria-label", "Seções sociais");',
  );
  replace(
    'w.setAttribute("role", "menu"),',
    'w.setAttribute("role", "group"),\n    w.setAttribute("aria-label", "Ações da pessoa"),',
  );
  replace('    Q = [],', '    Q = [],\n    __socialSearched = false,');
  replace('    j = null,', '    j = null,\n    __socialPersonRequested = null,');
  // Respostas de uma pessoa tocada antes de fechar ou sair não reabrem o menu.
  replace(
    '      oe.key === "Escape" && (le(), (w.hidden = !0));',
    '      oe.key === "Escape" && (__socialPersonRequested = null, le(), (w.hidden = !0));',
  );
  replace(
    '      !w.hidden && !w.contains(oe.target) && (w.hidden = !0);',
    '      if (!w.contains(oe.target)) { __socialPersonRequested = null; w.hidden = true; }',
  );
  replace(
    '            ? ((j = se), Ie())',
    '            ? (n.active() && __socialPersonRequested !== null && String(se.id) === String(__socialPersonRequested) && (__socialPersonRequested = null, (j = se), Ie()))',
  );
  replace(
    '        if (!n.active()) return;\n        const fe = n.pick(oe, se);',
    '        __socialPersonRequested = null;\n        w.hidden = true;\n        if (!n.active()) return;\n        const fe = n.pick(oe, se);',
  );
  replace(
    '        ((W = { x: oe, y: se }), L({ a: "who", id: fe }));',
    '        (__socialPersonRequested = fe, (W = { x: oe, y: se }), L({ a: "who", id: fe }));',
  );
  replace(
    '  return (\n    n.net.addEventListener("social", (oe) => {',
    `  const __socialDismissPerson = () => { __socialPersonRequested = null; w.hidden = true; };
  n.net.addEventListener("leave", __socialDismissPerson);
  n.net.addEventListener("connection", event => { if (!event.detail?.connected) __socialDismissPerson(); });
  return (
    n.net.addEventListener("social", (oe) => {`,
  );
  replace(
    '  document.addEventListener("visibilitychange", () => __localSocialSync());',
    '  document.addEventListener("visibilitychange", () => { __localSocialSync(); if (document.visibilityState === "hidden") __socialDismissPerson(); });',
  );
  replace(
    '      H());\n  }\n  function le()',
    '      H());\n    o.tabIndex = -1;\n    o.focus({ preventScroll: true });\n  }\n  function le()',
  );
  replace(
    '  function le() {\n',
    '  function le() {\n    const restore = !a.hidden && a.contains(document.activeElement);\n',
  );
  replace(
    '    __localSocialSync();\n  }\n  function be()',
    '    __localSocialSync();\n    if (restore) e.focus({ preventScroll: true });\n  }\n  function be()',
  );
  replace('      if (Q.length) {', '      if (__socialSearched) {');
  replace(
    '        g.append(st("p", "social-note", "Resultado da busca"));',
    '        const result = st("p", "social-note", Q.length ? "Resultado da busca" : "Nenhuma pessoa encontrada para esse apelido.");\n        result.setAttribute("role", "status");\n        g.append(result);',
  );
  // O servidor re-renderiza a conversa ao chegar mensagem. Preservar seleção e
  // foco do compositor evita expulsar quem está digitando a cada atualização.
  replace(
    '  function H() {\n',
    '  function H() {\n    const __socialCompose = g.querySelector(".social-compose input");\n    const __socialTyping = __socialCompose && document.activeElement === __socialCompose;\n    const __socialSelection = __socialTyping ? [__socialCompose.selectionStart, __socialCompose.selectionEnd] : null;\n',
  );
  replace(
    '      Se(), __localSocialSync());',
    '      Se(), __localSocialSync());\n    if (__socialTyping && S === "inbox" && U) {\n      const input = g.querySelector(".social-compose input");\n      if (input && (document.activeElement === document.body || document.activeElement === __socialCompose)) {\n        input.focus({ preventScroll: true });\n        if (__socialSelection[0] !== null) input.setSelectionRange(...__socialSelection);\n      }\n    }',
  );
  replace(
    '  function ve(oe, se) {\n',
    '  function ve(oe, se) {\n    if (U !== oe) ie = "";\n    $ = null;\n',
  );
  // O transporte descarta envios sem conexão. Não apagar uma DM que não saiu.
  replace(
    '        const ke = fe.value.trim();',
    '        if (n.net.connected === false) { n.toast("A conexão caiu. Aguarde reconectar para enviar a mensagem."); return; }\n        const ke = fe.value.trim();',
  );
  replace(
    '        ((Q = se.people ?? []),',
    '        ((__socialSearched = true), (Q = se.people ?? []),',
  );
  // A busca escolhe sua seção no envio; respostas não desfazem a navegação.
  replace(
    '(oe.preventDefault(), L({ a: "find", nick: u.value }));',
    '(oe.preventDefault(), (S = "friends"), (U = ""), (ie = ""), H(), L({ a: "find", nick: u.value }));',
  );
  replace(
    '      else if (se.a === "found")',
    '      else if (se.a === "found" && n.active() && !a.hidden && S === "friends")',
  );
  replace('          a.hidden ? ce("friends") : H());', '          H());');
  // Respostas assíncronas da sessão anterior não recuperam dados após logout.
  // Consultar uma pessoa no mundo continua disponível para visitantes.
  replace(
    '      else if (se.a === "friends") {',
    '      else if (!M && se.a !== "who") return;\n      else if (se.a === "friends") {',
  );
  // Um rascunho abandonado não pode aparecer ao selecionar outra pessoa depois.
  replace('((S = oe), (U = ""), be(), H());', '((S = oe), (U = ""), (ie = ""), be(), H());');
  // Abrir conversa pelo contexto da pessoa precisa abrir também o painel.
  replace(
    'oe("Mensagem", () => ve(j.uid, j.nick)),',
    'oe("Mensagem", () => { ve(j.uid, j.nick); ce("inbox"); }),',
  );
  // Dados privados pertencem à identidade, não à duração desta página. Um hello
  // da mesma conta após reconexão preserva o rascunho; logout/troca o elimina.
  replace(
    '  function ce(oe) {',
    `  function __socialResetIdentity() {
    if (__localSocialFocus) L({ a: "thread_focus", uid: __localSocialFocus, on: false });
    __localSocialFocus = ""; __localSocialRead = "";
    k = []; B = null; P = []; z = []; R = []; N = []; O = null; Q = [];
    __socialSearched = false; U = ""; J = ""; K = []; $ = null; ie = "";
    re = null; we = null; G = ""; j = null; __socialPersonRequested = null; E = 0; C = 0; S = "friends";
    u.value = ""; w.hidden = true; w.replaceChildren();
    g.replaceChildren(); l.replaceChildren(); l.hidden = true; m.hidden = true;
    x.stop();
  }
  function ce(oe) {`,
  );
  replace(
    '      if (se.a === "hello")\n        ((M = !!se.account),',
    `      if (se.a === "hello")
        ((!se.account || (typeof se.uid === "string" ? se.uid : "") !== y) && __socialResetIdentity(),
          (M = !!se.account),`,
  );
  replace(
    '        ((M = !1), (c.textContent = se.text || q3), a.hidden || H());',
    '        (__socialResetIdentity(), (M = !1), (y = ""), q(), (c.textContent = se.text || q3), a.hidden || H());',
  );
  return source.slice(0, start) + panel + source.slice(end);
}
