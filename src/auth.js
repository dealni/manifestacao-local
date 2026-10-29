import { randomUUID } from 'node:crypto';
import { applyReferral, ensureReferralCode, initializeWallet, settleReferral } from './points.js';
import { authAvailability, handleEmailLogin } from './auth-email.js';
import {
  productionMode,
  getUser,
  mutationSession,
  publicUser,
  sessionToken,
  durableAuthSave,
  normalizeEmail,
  allowAuthAttempt,
  EMAIL_ROUTES,
  MAIL_UNAVAILABLE,
  cleanNick,
  hashPassword,
  issueCode,
  checkPassword,
  DUMMY_PASSWORD_HASH,
  durableSessionCookie,
  consumeCode,
} from './auth-core.js';
export {
  sessionForToken,
  getSession,
  getUser,
  mutationSession,
  issueAccountTicket,
  resolveAccountTicket,
} from './auth-core.js';
export { authAvailability } from './auth-email.js';

export async function handleAuth(req, res, url, ctx) {
  const path = url.pathname;
  const production = productionMode(ctx);
  const authPath = path.startsWith('/api/auth/');
  if (!authPath && !['/api/me', '/api/payment-security', '/api/profile/nick'].includes(path))
    return false;
  const send = (status, payload) => {
    ctx.send(res, status, payload);
    return true;
  };
  const fail = (status, error) => send(status, { error, local: !production });
  ctx.state.users ??= [];
  ctx.state.sessions ??= {};
  const user = getUser(req, ctx.state);
  const requireSession = mutationSession(req, ctx.state, user);
  if (sendAuthInfo({ req, path, user, production, ctx, authPath, send })) return true;
  const rejected = validateAuthRequest(req, res, path, fail);
  if (rejected) return rejected;
  if (path === '/api/auth/logout') return logoutAccount({ req, res, ctx, production, send, fail });
  let body;
  try {
    body = await ctx.body(req);
  } catch {
    return fail(400, 'JSON inválido.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return fail(400, 'Envie um objeto JSON.');
  if (restrictProductionAuth({ production, authPath, req, res, ctx, body, path, fail }))
    return true;
  if (path === '/api/auth/email/request' || path === '/api/auth/email/verify')
    return handleEmailLogin(req, res, path, body, ctx, send, fail).catch((error) =>
      fail(
        error.status === 429 ? 429 : 503,
        'Login temporariamente indisponível. Tente novamente mais tarde.',
      ),
    );
  if (path === '/api/profile/nick')
    return updateProfile({ user, requireSession, body, ctx, fail, send, production });
  return handlePasswordAuth({ req, res, path, body, ctx, send, fail, production });
}

async function handlePasswordAuth({ req, res, path, body, ctx, send, fail, production }) {
  const email = normalizeEmail(body.email);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return fail(400, 'Informe um e-mail válido para sua conta local.');
  const account = ctx.state.users.find((candidate) => candidate.email === email);
  if (path === '/api/auth/register')
    return registerAccount({ body, ctx, fail, send, email, account });
  if (path === '/api/auth/login')
    return passwordLogin({ body, ctx, fail, send, email, account, production, req, res });
  if (path === '/api/auth/resend' || path === '/api/auth/forgot') {
    const challenge = account
      ? issueCode(account, path.endsWith('forgot') ? 'resetChallenge' : 'verification')
      : {
          local: true,
          message: 'Modo local: não há uma conta cadastrada com este e-mail.',
        };
    ctx.save();
    return send(200, { ok: true, email, ...challenge });
  }
  return completePasswordChallenge({ path, body, ctx, send, fail, account, production, req, res });
}

async function updateProfile({ user, requireSession, body, ctx, fail, send, production }) {
  if (!user) return fail(401, 'Entre na sua conta local.');
  try {
    requireSession();
  } catch (error) {
    return fail(error.status, error.message);
  }
  const nick = cleanNick(body.nick);
  if (nick.length < 2 || nick.length > 12 || /\S+@\S+\.\S+|\d[\d\s()+-]{7,}\d/.test(nick))
    return fail(400, 'Use um apelido de 2 a 12 caracteres, sem e-mail ou telefone.');
  user.nick = nick;
  user.nickPending = false;
  ensureReferralCode(ctx.state, user);
  initializeWallet(ctx.state, user);
  settleReferral(ctx.state, user);
  try {
    await durableAuthSave(ctx);
  } catch {
    return fail(503, 'Não foi possível salvar o apelido. Tente novamente.');
  }
  return send(200, {
    ok: true,
    user: publicUser(user, production),
    local: !production,
  });
}

async function registerAccount({ body, ctx, fail, send, email, account }) {
  const nick = cleanNick(body.nick);
  if (nick.length < 2 || nick.length > 12 || /\S+@\S+\.\S+|\d[\d\s()+-]{7,}\d/.test(nick))
    return fail(400, 'Use um apelido de 2 a 12 caracteres, sem e-mail ou telefone.');
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 1024)
    return fail(400, 'A senha deve ter de 8 a 1024 caracteres.');
  if (account) return fail(409, 'Este e-mail já tem uma conta local.');
  const created = {
    id: randomUUID(),
    email,
    nick,
    passwordHash: await hashPassword(body.password),
    verified: false,
    createdAt: new Date().toISOString(),
    appearance: {},
    owned: {
      skins: [],
      bandeiras: [],
      passes: [],
      pvp: [],
      objetos: [],
      veiculos: [],
    },
    premium: false,
    ink: 1000000,
  };
  // Recheck after asynchronous hashing to avoid duplicate concurrent registrations.
  if (ctx.state.users.some((candidate) => candidate.email === email))
    return fail(409, 'Este e-mail já tem uma conta local.');
  const challenge = issueCode(created, 'verification');
  ctx.state.users.push(created);
  if (typeof body.referralCode === 'string') applyReferral(ctx.state, created, body.referralCode);
  ctx.save();
  return send(200, { ok: true, needVerify: true, email, ...challenge });
}

async function passwordLogin({ body, ctx, fail, send, email, account, production, req, res }) {
  const validPasswordInput = typeof body.password === 'string' && body.password.length <= 1024;
  const passwordHash = account?.passwordHash;
  const passwordMatches = validPasswordInput
    ? await checkPassword(body.password, passwordHash ?? DUMMY_PASSWORD_HASH)
    : false;
  if (
    !account ||
    !passwordMatches ||
    account.passwordHash !== passwordHash ||
    (production &&
      (account.demo ||
        account.dev ||
        account.localOnly ||
        /@(?:[^@]+\.)?(?:test|invalid|localhost)$/.test(account.email)))
  )
    return fail(401, 'E-mail ou senha inválidos.');
  if (!account.verified) {
    if (production) return fail(503, MAIL_UNAVAILABLE);
    const challenge = issueCode(account, 'verification');
    ctx.save();
    return send(200, { needVerify: true, email, ...challenge });
  }
  ensureReferralCode(ctx.state, account);
  initializeWallet(ctx.state, account);
  settleReferral(ctx.state, account);
  if (!(await durableSessionCookie(req, res, ctx, account)))
    return fail(503, 'Login temporariamente indisponível. Tente novamente.');
  return send(200, {
    ok: true,
    user: publicUser(account, production),
    local: !production,
  });
}

function sendAuthInfo({ req, path, user, production, ctx, authPath, send }) {
  if (req.method === 'GET' && path === '/api/me')
    return send(200, {
      user: publicUser(user, production),
      admin: false,
      local: !production,
      auth: authAvailability(ctx),
    });
  if (req.method === 'GET' && path === '/api/payment-security')
    return send(200, {
      authenticated: !!user,
      local: true,
      siteKey: null,
      captchaRequired: false,
      currency: 'points',
      paymentsEnabled: false,
      message: 'Use pontos internos no jogo. Pagamentos reais ainda não estão disponíveis.',
    });
  if (authPath && ['google', 'kick', 'twitch', 'discord'].includes(path.slice(10)))
    return send(200, {
      local: true,
      error: production
        ? 'Login externo indisponível. Entre com uma conta já verificada ou participe como visitante.'
        : 'OAuth externo desativado no modo local. Crie uma conta por e-mail; o código aparece nesta instalação.',
      loginUrl: '/manifestacao/?entrar=1',
    });
  return false;
}

function validateAuthRequest(req, res, path, fail) {
  const supported = [
    '/api/auth/email/request',
    '/api/auth/email/verify',
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/verify',
    '/api/auth/resend',
    '/api/auth/forgot',
    '/api/auth/reset',
    '/api/profile/nick',
  ];
  if (!supported.includes(path)) return fail(404, 'Rota de autenticação local não encontrada.');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(405, 'Use POST para esta operação.');
  }
  if (req.headers.origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(req.headers.origin).host === req.headers.host;
    } catch {
      /* URL inválida mantém sameOrigin=false e será recusada abaixo. */
    }
    if (!sameOrigin) return fail(403, 'Origem não autorizada. Use esta instalação local.');
  }
  return false;
}

async function completePasswordChallenge({
  path,
  body,
  ctx,
  send,
  fail,
  account,
  production,
  req,
  res,
}) {
  if (
    path === '/api/auth/reset' &&
    (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 1024)
  )
    return fail(400, 'A senha deve ter de 8 a 1024 caracteres.');
  if (
    !consumeCode(account, path.endsWith('reset') ? 'resetChallenge' : 'verification', body.code)
  ) {
    ctx.save();
    return fail(
      400,
      'Código inválido, expirado ou com tentativas esgotadas. Solicite outro código local.',
    );
  }
  if (path === '/api/auth/reset') {
    account.passwordHash = await hashPassword(body.password);
    for (const [token, session] of Object.entries(ctx.state.sessions))
      if (session.userId === account.id) delete ctx.state.sessions[token];
  }
  account.verified = true;
  ensureReferralCode(ctx.state, account);
  initializeWallet(ctx.state, account);
  settleReferral(ctx.state, account);
  if (!(await durableSessionCookie(req, res, ctx, account)))
    return fail(503, 'Login temporariamente indisponível. Solicite outro código.');
  return send(200, {
    ok: true,
    user: publicUser(account, production),
    local: !production,
  });
}

async function logoutAccount({ req, res, ctx, production, send, fail }) {
  const token = sessionToken(req);
  if (token) delete ctx.state.sessions[token];
  // Preserve the browser credential until revocation is durable: if storage
  // fails, the same logout can be retried instead of leaving a session on disk.
  try {
    await durableAuthSave(ctx);
  } catch {
    return fail(503, 'Não foi possível sair da conta. Tente novamente.');
  }
  res.setHeader(
    'Set-Cookie',
    `local_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production ? '; Secure' : ''}`,
  );
  return send(200, { ok: true, user: null, local: !production });
}

function restrictProductionAuth({ production, authPath, req, res, ctx, body, path, fail }) {
  if (production && authPath) {
    if (!allowAuthAttempt(req, ctx, normalizeEmail(body.email))) {
      res.setHeader('Retry-After', '60');
      return fail(429, 'Muitas tentativas. Aguarde um minuto e tente novamente.');
    }
    // Nunca emitir ou consumir desafios locais na internet, inclusive desafios
    // persistidos antes da migração. Um provider real exige integração explícita.
    if (EMAIL_ROUTES.has(path)) return fail(503, MAIL_UNAVAILABLE);
  }
  return false;
}
