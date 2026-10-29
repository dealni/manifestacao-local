function replaceOnce(source, before, after) {
  if (source.indexOf(before) < 0 || source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error(`Patch de mídia incompatível ou ambíguo: ${before.slice(0, 90)}`);
  }
  return source.replace(before, after);
}

/** Ajustes pequenos e reproduzíveis nos fluxos de mídia do cliente. */
export function applyMediaDesign(source) {
  source = applyEditorAccessibility(source);
  source = replaceOnce(
    source,
    '    (m.onclick = async () => {\n      if ((H3(t), !gn())) {',
    '    (m.onclick = async () => {\n      if (m.disabled) return;\n      if ((H3(t), !gn())) {',
  );
  source = replaceOnce(
    source,
    '        const ee = await ey(await gV(t), t.kind, Rv(t));\n        if (ee.status === "rejected")',
    `        const submitted = vV(t);
        const image = await gV(submitted);
        if (!h.open || Zh !== h) return;
        if (!image) throw new Error("Não foi possível preparar a imagem. Tente novamente.");
        const ee = await ey(image, submitted.kind, Rv(submitted));
        if (!h.open || Zh !== h) return;
        if (ee.status === "rejected")`,
  );
  source = replaceOnce(source, '  (Zh?.remove(),', '  (Zh?.close(),');
  source = replaceOnce(
    source,
    '          E = !1;\n          const I = M(),',
    '          E = !1;\n          if (Zh !== h || !h.open) return;\n          const I = M(),',
  );
  source = replaceOnce(
    source,
    '    mV().then(() => {\n      (k(!0), ae());',
    '    mV().then(() => {\n      if (Zh !== h || !h.open) return;\n      (k(!0), ae());',
  );

  source = replaceOnce(
    source,
    '          const I = await Ds();\n          (I && e.onBought(I, ee), h.close());',
    '          const I = await Ds();\n          if (!h.open || Zh !== h) return;\n          (I && e.onBought(I, ee), h.close());',
  );
  source = replaceOnce(
    source,
    '          const I = await gg(ee);\n          if (I) {',
    '          const I = await gg(ee);\n          if (!h.open || Zh !== h) return;\n          if (I) {',
  );
  source = replaceOnce(
    source,
    '  let S = "",\n    E = !1,',
    '  let __mediaDraftComplete = false;\n  let S = "",\n    E = !1,',
  );
  if (source.split('              localStorage.removeItem(Ff);').length !== 3)
    throw new Error('Descarte de rascunho incompatível');
  source = source.replaceAll(
    '              localStorage.removeItem(Ff);',
    '              __mediaDraftComplete = true;\n              localStorage.removeItem(Ff);',
  );
  source = replaceOnce(
    source,
    '      (N?.dispose(), h.remove(), Zh === h && (Zh = void 0));',
    '      (__mediaDraftComplete || H3(t), N?.dispose(), h.remove(), Zh === h && (Zh = void 0));',
  );
  source = replaceOnce(
    source,
    'const preview = St("account-btn", "Ver anúncio no cenário 3D", () => { if (!busy && media) { w4(); he.media = media; he.kind = media.kind; he.index = 0; Bj(); } });',
    `const preview = St("account-btn", "Ver anúncio no cenário 3D", () => { if (!busy && media) { w4(); he.media = media; he.kind = media.kind; he.index = 0; Bj(); } });
  preview.disabled = true;`,
  );
  source = replaceOnce(
    source,
    'busy = true; publish.disabled = file.disabled = true;',
    'busy = true; publish.disabled = file.disabled = preview.disabled = true;',
  );
  source = replaceOnce(
    source,
    'busy = false; publish.disabled = !media; file.disabled = false;',
    'busy = false; publish.disabled = preview.disabled = !media; file.disabled = false;',
  );
  source = replaceOnce(
    source,
    'const selected = file.files?.[0]; media = null; publish.disabled = true;',
    'const selected = file.files?.[0]; media = null; publish.disabled = preview.disabled = true;',
  );
  source = replaceOnce(
    source,
    'finally { busy = false; file.disabled = false; publish.disabled = !media; }',
    'finally { busy = false; file.disabled = false; publish.disabled = preview.disabled = !media; }',
  );
  source = replaceOnce(
    source,
    'media = item; requestId = newRequestId(); publish.disabled = false;',
    'media = item; requestId = newRequestId(); publish.disabled = preview.disabled = false;',
  );
  source = replaceOnce(
    source,
    '    i.innerHTML = `<button class="dialog-close sign-shop-close" aria-label="Fechar">×</button>',
    `    const focused = i.open && i.contains(document.activeElement) ? document.activeElement : null;
    const focusIdentity = focused ? ["delete", "carry", "buy", "new"].find(key => focused.dataset[key] !== undefined) : null;
    const focusValue = focusIdentity ? focused.dataset[focusIdentity] : null;
    i.innerHTML = \`<button class="dialog-close sign-shop-close" aria-label="Fechar">×</button>`,
  );
  source = replaceOnce(
    source,
    '  };\n  (a(),\n    i.addEventListener("click", async (s) => {',
    `    if (focused && (document.activeElement === document.body || document.activeElement === i)) {
      const replacement = [...i.querySelectorAll("button")].find(button => focusIdentity ? button.dataset[focusIdentity] === focusValue : button.classList.contains("sign-shop-close"));
      const target = replacement || i.querySelector("h2");
      if (target) { if (!replacement) target.tabIndex = -1; target.focus({ preventScroll: true }); }
    }
  };
  (a(),
    i.addEventListener("click", async (s) => {`,
  );
  // As guardas assíncronas de anúncios pertencem ao runtime de pontos.
  source = replaceOnce(
    source,
    '  ts(e.account);\n}\nconst nA',
    '  ts(e.account);\n  return e;\n}\nconst nA',
  );
  source = replaceOnce(
    source,
    '(await ty(o.dataset.delete), a());',
    `const result = await ty(o.dataset.delete);
            if (!i.open || eu !== i) return;
            a();
            if (result.cleanupPending) i.querySelector(".sign-shop-error").textContent = "Cartaz removido. A limpeza do arquivo está pendente; o espaço ainda pode permanecer ocupado.";`,
  );
  return source;
}

function applyEditorAccessibility(source) {
  source = replaceOnce(
    source,
    '    <header class="se-head">',
    '    <header class="se-head" aria-label="Editor de cartaz e bandeira">',
  );
  source = replaceOnce(
    source,
    '(h.className = "sign-editor"),',
    '(h.className = "sign-editor"),\n    h.setAttribute("aria-label", "Editor de cartaz e bandeira"),',
  );
  source = replaceOnce(
    source,
    'I.setAttribute("aria-selected", String(I.dataset.tab === ee)),',
    '{ I.setAttribute("aria-selected", String(I.dataset.tab === ee)); I.tabIndex = I.dataset.tab === ee ? 0 : -1; f.setAttribute("aria-label", I.dataset.tab === ee ? I.textContent : f.getAttribute("aria-label") || "Ferramentas"); },',
  );
  source = replaceOnce(
    source,
    'D.setAttribute("aria-checked", String(D.dataset.kind === t.kind)),',
    '{ D.setAttribute("aria-checked", String(D.dataset.kind === t.kind)); D.tabIndex = D.dataset.kind === t.kind ? 0 : -1; },',
  );
  source = replaceOnce(
    source,
    '    h.addEventListener("keydown", (ee) => {\n      ee.target.matches("textarea, input") ||',
    `    h.addEventListener("keydown", (ee) => {
      const choice = ee.target.closest('[role="tab"], [role="radio"]');
      if (choice && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(ee.key)) {
        const group = choice.closest('[role="tablist"], [role="radiogroup"]');
        const choices = [...(group?.querySelectorAll('[role="tab"], [role="radio"]') || [])].filter(item => !item.disabled);
        const at = choices.indexOf(choice);
        if (at >= 0 && choices.length) {
          ee.preventDefault(); ee.stopPropagation();
          const next = ee.key === "Home" ? 0 : ee.key === "End" ? choices.length - 1 : (at + (["ArrowRight", "ArrowDown"].includes(ee.key) ? 1 : -1) + choices.length) % choices.length;
          choices[next].focus(); choices[next].click();
          return;
        }
      }
      ee.target.matches("textarea, input") ||`,
  );
  return source;
}
