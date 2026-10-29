function replaceOnce(source, before, after) {
  if (source.indexOf(before) < 0 || source.indexOf(before) !== source.lastIndexOf(before))
    throw new Error('Patch Turnstile incompatível ou ambíguo: ' + before.slice(0, 70));
  return source.replace(before, after);
}

// Um token novo para cada envio/reenvio; verificar o OTP continua independente.
export function applyTurnstileClient(source) {
  source = replaceOnce(
    source,
    '  const post = (path, body) => qt(path, { method: "POST", body: JSON.stringify(__withReferral(path, body)) });',
    `  const captcha = xt?.auth?.turnstileSiteKey ? __emailChallenge(active) : null;
  const post = async (path, body) => {
    if (path === "/api/auth/email/request" && captcha) body = { ...body, turnstileToken: await captcha.token() };
    if (!active()) throw new Error("Abra o login novamente para continuar.");
    return qt(path, { method: "POST", body: JSON.stringify(__withReferral(path, body)) });
  };`,
  );
  source = replaceOnce(
    source,
    '[go("E-MAIL", input)], "Enviar código"',
    '[go("E-MAIL", input), ...(captcha ? [captcha.host] : [])], "Enviar código"',
  );
  source = replaceOnce(
    source,
    '[go("CÓDIGO", code)], "Entrar"',
    '[go("CÓDIGO", code), ...(captcha ? [captcha.host] : [])], "Entrar"',
  );
  return runtime + '\n' + source;
}

const runtime = `let __turnstileLoading = null;
let __turnstileDispose = null;
function __loadTurnstile() {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (__turnstileLoading) return __turnstileLoading;
  __turnstileLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    let settled = false;
    const timer = setTimeout(() => fail(), 15000);
    const fail = () => {
      if (settled) return;
      settled = true; clearTimeout(timer); script.remove(); __turnstileLoading = null;
      reject(new Error("Não foi possível carregar a proteção contra robôs. Tente novamente."));
    };
    script.onerror = fail;
    script.onload = () => {
      if (settled) return;
      if (!window.turnstile?.render) return fail();
      settled = true; clearTimeout(timer); resolve(window.turnstile);
    };
    document.head.append(script);
  });
  return __turnstileLoading;
}
function __emailChallenge(active) {
  __turnstileDispose?.();
  const host = T("div", "email-challenge");
  let widget = null, pending = null, disposed = false;
  const remove = () => {
    if (widget !== null) { try { window.turnstile?.remove(widget); } catch {} widget = null; }
  };
  __turnstileDispose = () => { disposed = true; pending?.(new Error("Abra o login novamente para continuar.")); remove(); };
  return { host, async token() {
    await __loadTurnstile();
    if (disposed || !active()) throw new Error("Abra o login novamente para continuar.");
    pending?.(new Error("Uma nova verificação foi iniciada. Tente novamente."));
    remove();
    return new Promise((resolve, reject) => {
      let settled = false, failed = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer); clearInterval(watch); pending = null;
        if (error) { failed = true; remove(); reject(error); } else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error("Verificação expirada. Tente novamente.")), 120000);
      const watch = setInterval(() => { if (!active()) finish(new Error("Abra o login novamente para continuar.")); }, 250);
      pending = finish;
      try {
        widget = window.turnstile.render(host, {
          sitekey: xt.auth.turnstileSiteKey, action: "email_login", size: host.clientWidth >= 300 ? "flexible" : "compact", theme: "auto", language: "pt-br",
          callback: value => finish(null, value),
          "error-callback": () => finish(new Error("A proteção contra robôs falhou. Tente novamente.")),
          "expired-callback": () => finish(new Error("Verificação expirada. Tente novamente.")),
          "timeout-callback": () => finish(new Error("Verificação expirada. Tente novamente.")),
        });
        if (failed) remove();
      } catch { finish(new Error("Não foi possível iniciar a proteção contra robôs.")); }
    });
  } };
}
`;
