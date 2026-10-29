function replaceOnce(source, before, after) {
  const first = source.indexOf(before);
  if (first < 0 || first !== source.lastIndexOf(before))
    throw new Error(`Patch de conta incompatível ou ambíguo: ${before.slice(0, 90)}`);
  return source.replace(before, after);
}

/** Corrige estados de conta no cliente reproduzível, sem alterar contratos de autenticação. */
export function applyAuthDesign(source) {
  source = replaceOnce(
    source,
    '      (d.preventDefault(), (r.textContent = ""), (c.disabled = !0));',
    '      d.preventDefault();\n      if (c.disabled) return;\n      r.textContent = "";\n      c.disabled = true;\n      o.setAttribute("aria-busy", "true");',
  );
  source = replaceOnce(
    source,
    '      } finally {\n        c.disabled = !1;\n      }\n    }),\n    o.append(...t, r, c));',
    '      } finally {\n        c.disabled = !1;\n        o.removeAttribute("aria-busy");\n      }\n    }),\n    o.append(...t, r, c));',
  );
  source = replaceOnce(
    source,
    'Ch("Digite o código", t || "Enviamos um código de 6 dígitos para " + email + ".",',
    'Ch("Digite o código", t || (__loopbackClient && __localAuthCodes.has(email) ? "Use o código local de 6 dígitos exibido abaixo para " + email + "." : "Enviamos um código de 6 dígitos para " + email + "."),',
  );
  source = replaceOnce(
    source,
    'Sem conta, este aparelho guarda o apelido. Com conta, a avenida usa o novo agora; a conta ainda guarda o antigo, então ele volta na próxima entrada, a menos que o seu personagem tenha ficado na avenida.',
    'Sem conta, este aparelho guarda o apelido. Com conta, o novo apelido também fica salvo para a próxima entrada.',
  );
  source = replaceOnce(
    source,
    '    (d8(e),\n    pe("#nick-dialog").close(),',
    '    (d8(e),\n    xt?.user && ts({ ...xt, user: { ...xt.user, nick: e } }),\n    pe("#nick-dialog").close(),',
  );
  source = replaceOnce(
    source,
    '        (t) => (t.ok ? e : null),',
    `        async (t) => {
          try {
            return t.ok && (await t.json())?.enabled === true ? e : null;
          } catch {
            return null;
          }
        },`,
  );
  const start = source.indexOf('async function ay() {');
  const end = source.indexOf('\nasync function sy(n)', start);
  if (start < 0 || end < start) throw new Error('Patch de conta incompatível: sair da conta');
  source = replaceOnce(
    source,
    source.slice(start, end),
    `async function ay() {
  await qt("/api/auth/logout", { method: "POST", body: "{}" });
  if (wi) {
    wi.readOnly = false;
    wi.maxLength = 12;
    wi.value = localStorage.getItem("paulista-nickname") || "";
  }
  ts(xt ? { ...xt, user: null, ticket: null } : null);
}`,
  );
  source = replaceOnce(
    source,
    '      const x = T("button", "account-btn link account-signout", "Sair");',
    '      const __signOutStatus = T("p", "sc-error");\n      __signOutStatus.setAttribute("role", "alert");\n      const x = T("button", "account-btn link account-signout", "Sair");',
  );
  source = replaceOnce(
    source,
    '          ((x.disabled = !0),\n            await ay(),\n            t.close(),\n            n.playing() &&\n              n.toast("Você saiu da conta. Pode continuar na avenida."));',
    `          if (x.disabled) return;
          x.disabled = true;
          __signOutStatus.textContent = "";
          x.setAttribute("aria-busy", "true");
          try {
            await ay();
            t.close();
            if (n.playing()) n.toast("Você saiu da conta. Pode continuar na avenida.");
          } catch {
            __signOutStatus.textContent = "Não foi possível sair da conta. Confira sua conexão e tente novamente.";
          } finally {
            x.disabled = false;
            x.removeAttribute("aria-busy");
          }`,
  );
  source = replaceOnce(
    source,
    '        g.append(__pointsButton(), w, x),',
    '        g.append(__pointsButton(), w, x, __signOutStatus),',
  );
  return applyAuthSnapshotGuards(source);
}

/** Vincula respostas de conta à identidade que iniciou a operação. */
export function applyAuthSnapshotGuards(source) {
  source = replaceOnce(
    source,
    'function ts(n) {',
    `let __authIdentityEpoch = 0;
const __authSnapshotEpochs = new WeakMap();
function __authTagSnapshot(value, epoch) {
  if (value && typeof value === "object") __authSnapshotEpochs.set(value, epoch);
  return value;
}
function ts(n) {
  if (n && __authSnapshotEpochs.has(n) && __authSnapshotEpochs.get(n) !== __authIdentityEpoch) return;
  if ((xt?.user?.id ?? null) !== (n?.user?.id ?? null)) __authIdentityEpoch++;`,
  );
  const start = source.indexOf('async function qt(n, e) {');
  const end = source.indexOf('\n}', start) + 2;
  if (start < 0 || end <= start) throw new Error('Patch de conta incompatível: transporte');
  const transport = source.slice(start, end);
  const guarded = replaceOnce(
    replaceOnce(
      transport,
      'async function qt(n, e) {',
      'async function qt(n, e) {\n  const __epoch = __authIdentityEpoch;',
    ),
    '  return i;',
    '  __authTagSnapshot(i?.account, __epoch);\n  return __authTagSnapshot(i, __epoch);',
  );
  source = replaceOnce(source, transport, guarded);
  source = replaceOnce(
    source,
    'async function ey(n, e, t) {',
    'async function ey(n, e, t) {\n  const __epoch = __authIdentityEpoch;',
  );
  return replaceOnce(
    source,
    '  return (a.account ? ts(a.account) : await tr(), a.design);',
    '  if (__epoch !== __authIdentityEpoch) return a.design;\n  __authTagSnapshot(a.account, __epoch);\n  return (a.account ? ts(a.account) : await tr(), a.design);',
  );
}
