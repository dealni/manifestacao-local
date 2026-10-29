import { randomBytes, randomInt, randomUUID, timingSafeEqual, createHmac } from 'node:crypto';
import { clientIp } from './runtime-config.js';
import { turnstileEnabled, verifyEmailChallenge } from './turnstile.js';
import { applyReferral, ensureReferralCode, initializeWallet, settleReferral } from './points.js';
import {
  productionMode,
  ticketSecret,
  normalizeEmail,
  allowAuthAttempt,
  durableAuthSave,
  durableSessionCookie,
  publicUser,
} from './auth-core.js';

const emailLoginLocks = new WeakMap();
const emailLoginGlobal = new WeakMap();
const EMAIL_LOGIN_MS = 10 * 60 * 1000;
const EMAIL_LOGIN_COOLDOWN_MS = 60 * 1000;
const EMAIL_LOGIN_MAX_CHALLENGES = 2000;
const emailAvailable = (ctx) =>
  !productionMode(ctx) ||
  (ctx.emailDelivery?.available === true &&
    typeof ctx.config?.emailCodeSecret === 'string' &&
    ctx.config.emailCodeSecret.length >= 32);

/** Shared by identity and game account payloads consumed by the public client. */
export function authAvailability(ctx) {
  const production = productionMode(ctx);
  return {
    registrationAvailable: !production,
    recoveryAvailable: !production,
    emailLoginAvailable: emailAvailable(ctx),
    emailCodeAvailable: emailAvailable(ctx),
    loginMethod: 'email-code',
    ...(turnstileEnabled(ctx.config) ? { turnstileSiteKey: ctx.config.turnstileSiteKey } : {}),
  };
}

// Serialize OTP state transitions across asynchronous persistence and provider calls.
async function emailLoginExclusive(ctx, key, action) {
  let locks = emailLoginLocks.get(ctx.state);
  if (!locks) emailLoginLocks.set(ctx.state, (locks = new Map()));
  let entry = locks.get(key);
  if ((!entry && locks.size >= 2000) || (entry && entry.pending >= 3)) {
    const error = new Error('OTP ocupado');
    error.status = 429;
    throw error;
  }
  if (!entry) locks.set(key, (entry = { tail: Promise.resolve(), pending: 0 }));
  entry.pending++;
  const current = entry.tail.catch(() => {}).then(action);
  entry.tail = current;
  try {
    return await current;
  } finally {
    if (--entry.pending === 0) locks.delete(key);
  }
}

function emailDigest(ctx, value) {
  return createHmac('sha256', ctx.config?.emailCodeSecret ?? ticketSecret)
    .update(value)
    .digest('hex');
}

export async function handleEmailLogin(req, res, path, body, ctx, send, fail) {
  const production = productionMode(ctx);
  if (!emailAvailable(ctx)) return fail(503, 'Login por e-mail temporariamente indisponível.');
  const email = normalizeEmail(body.email);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return fail(400, 'Informe um e-mail válido.');
  if (production && /@(?:[^@]+\.)?(?:test|invalid|localhost)$/.test(email))
    return fail(400, 'Informe um e-mail válido.');
  if (!production && !allowAuthAttempt(req, ctx, email))
    return fail(429, 'Muitas tentativas. Aguarde um minuto.');
  if (
    path === '/api/auth/email/request' &&
    !(await verifyEmailChallenge(req, body.turnstileToken, ctx.config))
  )
    return fail(403, 'Não foi possível validar a proteção contra robôs. Tente novamente.');
  // The limit applies to sends as well as verification, across all identities.
  const nowBucket = Date.now();
  let global = emailLoginGlobal.get(ctx);
  if (!global || global.until <= nowBucket)
    emailLoginGlobal.set(ctx, (global = { count: 0, until: nowBucket + 60000 }));
  if (++global.count > 120) return fail(429, 'Muitas tentativas. Aguarde um minuto.');
  const key = emailDigest(ctx, `identity:${email}`);
  return emailLoginExclusive(ctx, key, async () => {
    const now = Date.now();
    const challenges = (ctx.state.emailLoginChallenges ??= {});
    for (const [key, challenge] of Object.entries(challenges))
      if (!challenge || challenge.expiresAt <= now) delete challenges[key];
    const previous = challenges[key];
    if (path.endsWith('/request'))
      return requestEmailCode({
        req,
        res,
        body,
        ctx,
        send,
        fail,
        production,
        previous,
        challenges,
        key,
        now,
        email,
      });
    if (invalidEmailChallenge(previous, now))
      return fail(400, 'Código inválido ou expirado. Solicite outro código.');
    previous.attempts += 1;
    const code = String(body.code ?? '');
    const digest = emailDigest(ctx, `${key}:${previous.nonce}:${code}`);
    if (
      !/^\d{6}$/.test(code) ||
      previous.digest.length !== digest.length ||
      !timingSafeEqual(Buffer.from(previous.digest), Buffer.from(digest))
    ) {
      await durableAuthSave(ctx);
      return fail(400, 'Código inválido ou expirado. Solicite outro código.');
    }
    // Consume durably before account/session creation; a replay can never authenticate.
    previous.delivered = false;
    previous.digest = '';
    await durableAuthSave(ctx);
    let account = ctx.state.users.find((candidate) => candidate.email === email);
    if (unavailableEmailAccount(production, account, email))
      return fail(403, 'Esta conta não está disponível nesta instalação.');
    if (!account) {
      account = {
        id: randomUUID(),
        email,
        nick: `Pessoa${randomBytes(3).toString('hex')}`,
        nickPending: true,
        verified: true,
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
      ctx.state.users.push(account);
      if (previous.referralCode) applyReferral(ctx.state, account, previous.referralCode);
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
  });
}

async function requestEmailCode({
  req,
  res,
  body,
  ctx,
  send,
  fail,
  production,
  previous,
  challenges,
  key,
  now,
  email,
}) {
  if (previous && now - previous.createdAt < EMAIL_LOGIN_COOLDOWN_MS) {
    res.setHeader(
      'Retry-After',
      String(Math.ceil((EMAIL_LOGIN_COOLDOWN_MS - now + previous.createdAt) / 1000)),
    );
    return fail(429, 'Aguarde um minuto antes de solicitar outro código.');
  }
  if (!previous && Object.keys(challenges).length >= EMAIL_LOGIN_MAX_CHALLENGES)
    return fail(429, 'Muitas solicitações. Tente novamente mais tarde.');
  if (emailSendLimitReached(ctx, req, key, now)) {
    res.setHeader('Retry-After', '3600');
    return fail(429, 'Limite de envios atingido. Aguarde antes de solicitar outro código.');
  }
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const nonce = randomBytes(16).toString('hex');
  const challenge = {
    nonce,
    digest: emailDigest(ctx, `${key}:${nonce}:${code}`),
    createdAt: now,
    expiresAt: now + EMAIL_LOGIN_MS,
    attempts: 0,
    delivered: false,
    referralCode:
      typeof body.referralCode === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.referralCode)
        ? body.referralCode
        : null,
  };
  challenges[key] = challenge;
  try {
    await durableAuthSave(ctx);
    if (ctx.emailDelivery?.available === true) {
      const result = await ctx.emailDelivery.sendCode({
        email,
        code,
        expiresIn: EMAIL_LOGIN_MS / 1000,
      });
      if (result === false || result?.ok === false) throw new Error('delivery failed');
    }
    challenge.delivered = true;
    await durableAuthSave(ctx);
  } catch {
    // Never resurrect a code following ambiguous delivery or persistence errors.
    challenge.delivered = false;
    challenge.digest = '';
    try {
      await durableAuthSave(ctx);
    } catch {
      /* A entrega permanece invalidada mesmo se o armazenamento estiver indisponível. */
    }
    return fail(503, 'Não foi possível enviar o código. Aguarde e tente novamente.');
  }
  return send(200, {
    ok: true,
    email,
    expiresIn: EMAIL_LOGIN_MS / 1000,
    retryAfter: 60,
    resendAfter: 60,
    local: !production,
    ...(!production && ctx.emailDelivery?.available !== true ? { localCode: code } : {}),
    message: 'Código enviado. Confira sua caixa de entrada e o spam.',
  });
}

function emailSendLimitReached(ctx, req, key, now) {
  const quotas = (ctx.state.emailLoginSendLimits ??= {});
  for (const [quotaKey, quota] of Object.entries(quotas))
    if (!quota || quota.until <= now) delete quotas[quotaKey];
  const keys = [
    [key, 5],
    [emailDigest(ctx, `ip:${clientIp(req, ctx.config ?? {})}`), 20],
  ];
  if (
    Object.keys(quotas).length + keys.filter(([key]) => !quotas[key]).length > 5000 ||
    keys.some(([key, limit]) => quotas[key]?.count >= limit)
  ) {
    return true;
  }
  for (const [key] of keys) {
    quotas[key] ??= { count: 0, until: now + 3600000 };
    quotas[key].count++;
  }
  return false;
}

function invalidEmailChallenge(previous, now) {
  return !previous || !previous.delivered || previous.expiresAt <= now || previous.attempts >= 5;
}
function unavailableEmailAccount(production, account, email) {
  return (
    production &&
    account &&
    (account.demo ||
      account.dev ||
      account.localOnly ||
      /@(?:[^@]+\.)?(?:test|invalid|localhost)$/.test(email))
  );
}
