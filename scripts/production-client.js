import { createHash } from 'node:crypto';

function replaceOnce(source, before, after) {
  if (source.indexOf(before) < 0 || source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error(`Patch produção incompatível ou ambíguo: ${before.slice(0, 100)}`);
  }
  return source.replace(before, after);
}

/** O mesmo artefato atende loopback e a origem pública, sem endereços da VPS. */
export function applyProductionClient(source) {
  source = replaceOnce(
    source,
    'tl = ["localhost", "127.0.0.1", "[::1]"].includes(s_),',
    'tl = ["localhost", "127.0.0.1", "[::1]", "manifestacoes.com", "www.manifestacoes.com"].includes(s_),',
  );
  source = replaceOnce(
    source,
    'const __localAuthCodes = new Map();',
    `const __localAuthCodes = new Map();
const __loopbackClient = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const __publicAuthUnavailable = "Cadastro e recuperação de conta estão temporariamente indisponíveis. O envio de e-mail ainda não está configurado. Você pode entrar como visitante ou usar uma conta já confirmada.";
function __authActionAvailable(mode) {
  if (__loopbackClient || mode === "entrar") return true;
  const availability = typeof xt === "object" && xt?.auth;
  return mode === "criar" || mode === "codigo" ? availability?.registrationAvailable === true : availability?.recoveryAvailable === true;
}`,
  );
  source = replaceOnce(
    source,
    'function Ea(n = "entrar", e = "", t = "") {\n  if (["codigo", "nova"].includes(n))',
    `function Ea(n = "entrar", e = "", t = "") {
  if (!__authActionAvailable(n)) return ii("Conta", T("h2", "", "Conta indisponível"), T("p", "", __publicAuthUnavailable), Zr("Voltar", () => Ea("entrar", e)));
  if (__loopbackClient && ["codigo", "nova"].includes(n))`,
  );
  source = replaceOnce(
    source,
    'if (result.localCode) __localAuthCodes.set(',
    'if (__loopbackClient && result.localCode) __localAuthCodes.set(',
  );
  source = replaceOnce(
    source,
    't || `Código local: ${__localAuthCodes.get(e.trim().toLowerCase()) ?? "indisponível"}. Nenhum e-mail foi enviado.`,',
    't || (__loopbackClient ? `Código local: ${__localAuthCodes.get(e.trim().toLowerCase()) ?? "indisponível"}. Nenhum e-mail foi enviado.` : "Use o código enviado pelo serviço de e-mail."),',
  );
  source = replaceOnce(
    source,
    '(c.textContent = `Código local: ${__localAuthCodes.get(e.trim().toLowerCase()) ?? "indisponível"}`));',
    '(c.textContent = __loopbackClient ? `Código local: ${__localAuthCodes.get(e.trim().toLowerCase()) ?? "indisponível"}` : "Solicitação enviada"));',
  );
  source = replaceOnce(
    source,
    'Use E-mail para criar ou entrar em uma conta armazenada neste computador. Google e Kick precisam de serviços externos.',
    'Google e Kick estão indisponíveis. Use E-mail para entrar com um código de 6 dígitos; você também pode jogar como visitante.',
  );
  // A experiência pública é um beta gratuito. Não sugere checkout, envio ou entrega inexistentes.
  source = source
    .replaceAll(
      'O código de recuperação será exibido aqui. Nenhum e-mail é enviado no modo local.',
      'A recuperação depende do serviço de e-mail. Se estiver indisponível, entre como visitante.',
    )
    .replaceAll(
      'guardar o seu personagem, bandeiras, cartazes e veículos neste computador.',
      'guardar o seu personagem, bandeiras, cartazes e veículos nesta instalação.',
    )
    .replaceAll(
      'Compra simulada gratuitamente neste computador. Sem cobrança real.',
      'Beta gratuito. Nenhuma cobrança ou pagamento real.',
    )
    .replaceAll('Grátis · local', 'Grátis · beta')
    .replaceAll('grátis · local', 'grátis · beta')
    .replaceAll(
      'Modo local: compra simulada gratuitamente. Consultando confirmação local…',
      'Beta gratuito: ativando benefício. Não há pagamento real…',
    )
    .replaceAll(
      'Compra local confirmada. Não existe cobrança real.',
      'Benefício gratuito ativado. Não existe cobrança real.',
    )
    .replaceAll(
      'Entre na sua conta local para simular a compra.',
      'Entre na sua conta para ativar este benefício gratuito.',
    )
    .replaceAll('neste computador', 'nesta instalação');
  source = applyEmailCodeLogin(applyProductionAvailabilityCopy(source));
  const loginStart = source.indexOf('function Yr(n = !1) {');
  const loginEnd = source.indexOf('let xt = null;', loginStart);
  if (loginStart < 0 || loginEnd < 0)
    throw new Error('Opções de login incompatíveis com o cliente');
  source =
    source.slice(0, loginStart) +
    `function Yr(n = !1) {
  const row = T("div", \`login-row\${n ? " big" : ""}\`);
  const email = T("a", "account-btn login-mail", "E-mail");
  email.href = nl;
  email.title = "Entrar ou criar conta com código por e-mail";
  row.append(email);
  return row;
}
` +
    source.slice(loginEnd);
  return replaceOnce(
    source,
    'return tl && xt?.kickVincular && xt.user && !xt.user.kick\n    ? "/api/auth/kick?vincular=1"\n    : null;',
    'return null;',
  );
}

/** Login único por e-mail, mantendo a atualização de conta e a entrada do jogo existentes. */
export function applyEmailCodeLogin(source) {
  const start = source.indexOf('function Ea(n = "entrar", e = "", t = "") {');
  const end = source.indexOf('function t_(n, e) {', start);
  if (start < 0 || end < 0) throw new Error('Diálogo de autenticação incompatível');
  return (
    source.slice(0, start) +
    `let __emailLoginEpoch = 0;
function __emailLoginAvailable() {
  return xt?.auth?.emailLoginAvailable === true || (__loopbackClient && xt?.auth?.emailLoginAvailable !== false);
}
function Ea(n = "entrar", e = "", t = "", challenge = null) {
  clearInterval(Rx);
  const epoch = ++__emailLoginEpoch;
  if (!__emailLoginAvailable()) return ii(e_, T("h2", "", "Login temporariamente indisponível"), T("p", "", "O envio de código por e-mail está indisponível agora. Você pode continuar como visitante."), Zr("Continuar como visitante", ro));
  const email = String(e).trim().toLowerCase();
  let activeField = null;
  const active = () => epoch === __emailLoginEpoch && Gi?.open && activeField && Gi.contains(activeField);
  const post = (path, body) => qt(path, { method: "POST", body: JSON.stringify(body) });
  const remember = result => {
    if (__loopbackClient && result.localCode) __localAuthCodes.set(email, result.localCode);
  };
  if (n !== "email-codigo") {
    const input = Kr("email", "email", "voce@exemplo.com");
    activeField = input;
    input.value = email;
    input.maxLength = 254;
    return Ch("Entrar com e-mail", t || "Receba um código de 6 dígitos para entrar ou criar sua conta. Não precisa de senha.", [go("E-MAIL", input)], "Enviar código", async () => {
      if (!input.checkValidity()) throw new Error("Digite um e-mail válido.");
      const value = input.value.trim().toLowerCase();
      const result = await post("/api/auth/email/request", { email: value });
      if (active()) Ea("email-codigo", value, "", result);
    }, [Zr("Continuar como visitante", ro)]);
  }
  remember(challenge || {});
  const code = Kr("text", "one-time-code", "000000");
  activeField = code;
  code.inputMode = "numeric";
  code.maxLength = 6;
  code.pattern = "[0-9]{6}";
  const status = T("p", "sc-small");
  status.setAttribute("role", "status");
  const displayMessage = () => {
    status.textContent = __loopbackClient && __localAuthCodes.has(email) ? "Código local: " + __localAuthCodes.get(email) + ". Nenhum e-mail foi enviado." : "Confira também a caixa de spam. O código só pode ser usado uma vez.";
  };
  displayMessage();
  let deadline = 0;
  const resend = Zr("Reenviar código", async () => {
    if (Date.now() < deadline || resend.disabled) return;
    resend.disabled = true;
    try {
      const result = await post("/api/auth/email/request", { email });
      if (!active()) return;
      remember(result);
      code.value = "";
      displayMessage();
      status.textContent = (__loopbackClient && result.localCode) ? status.textContent : "Novo código enviado. Use o código mais recente.";
      startCooldown(result.resendAfter ?? result.retryAfter);
    } catch (error) {
      if (active()) status.textContent = error.message;
    } finally {
      if (active()) updateCooldown();
    }
  });
  function updateCooldown() {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    resend.disabled = remaining > 0;
    resend.textContent = remaining ? "Reenviar em " + remaining + "s" : "Reenviar código";
    if (!remaining) clearInterval(Rx);
  }
  function startCooldown(seconds) {
    const delay = Number(seconds);
    deadline = Date.now() + Math.min(600, Math.max(1, Number.isFinite(delay) ? delay : 60)) * 1000;
    clearInterval(Rx);
    updateCooldown();
    Rx = setInterval(updateCooldown, 1000);
  }
  Ch("Digite o código", t || "Enviamos um código de 6 dígitos para " + email + ".", [go("CÓDIGO", code)], "Entrar", async () => {
    if (!/^[0-9]{6}$/.test(code.value.trim())) throw new Error("Digite os 6 dígitos do código.");
    await post("/api/auth/email/verify", { email, code: code.value.trim() });
    if (active()) { clearInterval(Rx); await v2(); }
  }, [status, resend, Zr("Trocar e-mail", () => Ea("entrar", email)), Zr("Continuar como visitante", ro)]);
  startCooldown(challenge?.resendAfter ?? challenge?.retryAfter);
}
` +
    source.slice(end)
  );
}

/** Corrige somente promessas e rótulos; os controles e benefícios locais permanecem. */
export function applyProductionAvailabilityCopy(source) {
  source = source
    .replaceAll('Premium · grátis localmente', 'Premium · beta gratuito')
    .replaceAll('Grátis <small>modo local</small>', 'Grátis <small>beta gratuito</small>')
    .replaceAll(
      'Premium: seu personagem fica sempre conectado',
      'Premium: benefícios gratuitos para contas confirmadas',
    )
    .replaceAll('Personagem fica sempre conectado', 'Personagem ativo enquanto você joga')
    .replaceAll(
      'Mesmo quando você sai, seu personagem continua passeando pela avenida.',
      'O personagem sai do mundo ao desconectar. A permanência offline não está disponível nesta versão.',
    )
    .replaceAll(
      'Seu personagem continua na avenida quando você sai.',
      'O personagem sai do mundo ao desconectar.',
    )
    .replaceAll(
      'Seu personagem continua na avenida quando você sai',
      'Permanência offline indisponível nesta versão',
    );
  const publicCopy = [
    [
      'Jogar é grátis e sem login. O Premium é opcional: entre na sua conta apenas para comprar e guardar seus benefícios.',
      'Beta gratuito: jogue como visitante ou entre com seu e-mail e um código de 6 dígitos para guardar seu personagem.',
    ],
    [
      'Jogue grátis sem login. Entre para guardar compras e seu visual.',
      'Jogue como visitante ou entre com um código enviado ao seu e-mail.',
    ],
    ['Entre para comprar', 'Benefício para contas confirmadas'],
    [
      'Seu visual fica salvo: você volta para a avenida do jeito que estava.',
      'Use um personagem básico como visitante ou entre com seu e-mail para guardar o visual.',
    ],
    [
      'Entre na sua conta para guardar o Premium e os benefícios da compra.',
      'Jogue como visitante ou entre com seu e-mail para guardar benefícios gratuitos de conta.',
    ],
    [
      'Entre sem login e explore. Se quiser ir além, escolha um benefício permanente para a sua conta.',
      'Entre como visitante e explore. Use seu e-mail e um código para guardar benefícios de conta.',
    ],
  ];
  for (const [before, after] of publicCopy) {
    source = source.replaceAll(
      JSON.stringify(before),
      `(__loopbackClient ? ${JSON.stringify(before)} : ${JSON.stringify(after)})`,
    );
  }
  // O diálogo genérico de aquisição recebe descrições de vários benefícios.
  // Em público, sem cadastro, mostra o motivo real em vez de incentivar compras.
  source = source.replace(
    'T("p", "", n.why),',
    'T("p", "", __loopbackClient || __emailLoginAvailable() ? n.why : __publicAuthUnavailable),',
  );
  return patchProductionOnboarding(source);
}

/** Estes textos são HTML de um TemplateLiteral, não StringLiterals do bundle. */
export function patchProductionOnboarding(source) {
  const raw = [
    [
      '<p id="access-status" role="status">Jogar é grátis. O Premium é uma compra opcional, permanente e sem mensalidade.</p>',
      '<p id="access-status" data-beta-account role="status">${__loopbackClient ? "Jogar é grátis. Benefícios de conta são gratuitos nesta instalação." : "Beta gratuito: entre como visitante ou receba um código por e-mail para guardar seu personagem. Novos uploads estão temporariamente indisponíveis."}</p>',
    ],
    [
      '<p id="access-benefits">Moto e carro comum para usar no jogo. Spray com recargas ilimitadas, respeitando as regras e a área de paz. Só Premium pode criar cartazes: até 20 salvos, de uso ilimitado. Exclua um para criar outro. Bandeiras, skins e veículos premium têm seus próprios preços.</p>',
      '<p id="access-benefits">${__loopbackClient ? "Moto e carro comum para usar no jogo. Spray com recargas ilimitadas, respeitando as regras e a área de paz. Só Premium pode criar cartazes: até 20 salvos, de uso ilimitado. Exclua um para criar outro. Bandeiras, skins e veículos premium são benefícios gratuitos de conta." : "Personagens básicos podem jogar sem conta. Use seu e-mail e um código de 6 dígitos para guardar benefícios gratuitos de conta. Personagens saem do mundo ao desconectar. Não há cobrança real."}</p>',
    ],
    [
      '<small class="character-price">Grátis · beta · permanente</small>',
      '<small class="character-price">${__loopbackClient ? "Grátis · beta · permanente" : "Conta confirmada necessária"}</small>',
    ],
  ];
  for (const [before, after] of raw) source = replaceOnce(source, before, after);
  return source;
}

export function applyProductionHtml(html) {
  return html
    .replace(
      "connect-src 'self' blob: data: ws://127.0.0.1:* ws://localhost:*;",
      "connect-src 'self' blob: data: wss://manifestacoes.com wss://www.manifestacoes.com ws://127.0.0.1:* ws://localhost:*;",
    )
    .replaceAll(
      'Reconstrução local com compras simuladas gratuitas.',
      'Brasília Livre em beta gratuito. Sem pagamentos reais.',
    )
    .replaceAll('Modo local, sem pagamentos reais.', 'Beta gratuito, sem pagamentos reais.');
}

/** Cada recurso mutável recebe sua própria versão pelo conteúdo, sem alterar assets originais. */
export function versionMutableAssets(html, contents) {
  const filenames = new Set(['/client.js', '/local.css', '/local-compat.js', ...contents.keys()]);
  for (const filename of filenames) {
    if (!contents.has(filename))
      throw new Error(`Conteúdo ausente para versionamento: ${filename}`);
    const version = createHash('sha256').update(contents.get(filename)).digest('hex').slice(0, 12);
    const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reference = new RegExp(`((?:src|href)=["'])${escaped}(?:\\?v=[a-f0-9]{12})?(["'])`, 'g');
    if (!reference.test(html)) throw new Error(`Referência HTML ausente: ${filename}`);
    reference.lastIndex = 0;
    html = html.replace(reference, `$1${filename}?v=${version}$2`);
  }
  return html;
}
