function replaceOnce(source, before, after) {
  const index = source.indexOf(before);
  if (index < 0 || source.lastIndexOf(before) !== index)
    throw new Error(`Patch de Superchat incompatível ou ambíguo: ${before.slice(0, 85)}`);
  return source.replace(before, after);
}

/** Reduz o HUD sem mudar fila, entrega, áudio, pagamentos ou moderação. */
export function applyCleanSuperchat(source) {
  const dsStart = source.indexOf('function DS() {');
  const dsEnd = source.indexOf('\n}', dsStart);
  const addStart = source.indexOf(
    '  const e = T("button", "sc-chip sc-add", "+ Superchat");',
    dsStart,
  );
  if (dsStart < 0 || dsEnd < dsStart || addStart < dsStart || addStart >= dsEnd)
    throw new Error('Patch de Superchat incompatível: DS/sc-add');
  // A cópia do envio é adaptada por pontos e produção antes deste patch.
  // Substituir apenas a cauda específica de DS evita depender desse texto.
  source = replaceOnce(
    source,
    source.slice(addStart, dsEnd),
    '  Of > 0 && Lu.append(T("span", "sc-waiting", `${Of} na fila`));\n  ni.hidden = Id.length === 0 && Of === 0;\n  FS();\n  IS();',
  );
  // A faixa permanece na camada normal da página: nunca sobre um diálogo modal.
  const start = source.indexOf('function FS() {');
  const end = source.indexOf('\n}', start) + 2;
  if (start < 0 || end <= start) throw new Error('Patch de Superchat incompatível: FS');
  source = replaceOnce(
    source,
    source.slice(start, end),
    `function FS() {
  if (!ni) return;
  try {
    if (ni.hasAttribute("popover")) {
      try { ni.hidePopover(); } catch {}
      ni.removeAttribute("popover");
    }
    ni.classList.remove("over-dialog");
    ni.classList.toggle("sc-dialog-open", !!document.querySelector("dialog[open]"));
  } catch {}
}`,
  );
  source = replaceOnce(
    source,
    '  const t = X6(n);\n  (t && ji.append(t),',
    `  ji.tabIndex = 0;
  ji.setAttribute("aria-label", "Prévia do superchat");
  ji.onkeydown = (event) => {
    if (event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    ji.scrollTop = event.key === "End" ? ji.scrollHeight : 0;
  };
  const t = X6(n);
  (t && ji.append(t),`,
  );
  source = replaceOnce(
    source,
    '  const s = T("i", "sc-progress");\n  ((s.style.animationDuration = `${e}ms`),',
    `  if (a) {
  a.id = "sc-current-message";
  a.tabIndex = -1;
  const details = T("button", "sc-details", "Ver mensagem completa");
  details.type = "button";
  details.setAttribute("aria-expanded", "false");
  details.setAttribute("aria-controls", a.id);
  details.onclick = () => {
    const expanded = Ya.classList.toggle("sc-expanded");
    details.setAttribute("aria-expanded", String(expanded));
    details.textContent = expanded ? "Recolher mensagem" : "Ver mensagem completa";
    if (a) a.tabIndex = expanded ? 0 : -1;
  };
  Ya.append(details);
  }
  const s = T("i", "sc-progress");
  ((s.style.animationDuration = \`\${e}ms\`),`,
  );
  return source;
}
