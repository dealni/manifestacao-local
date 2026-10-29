import {
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHmac,
} from 'node:crypto';
import { promisify } from 'node:util';
import { clientIp } from './runtime-config.js';

const scrypt = promisify(scryptCallback);
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_MS = 15 * 60 * 1000;
// Hash deliberadamente sem credencial correspondente para manter o custo scrypt
// também quando o e-mail não está cadastrado.
export const DUMMY_PASSWORD_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export const normalizeEmail = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
export const cleanNick = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex -- Remove ou rejeita controles ASCII recebidos do usuário.
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
export const publicUser = (user, production = false) =>
  user
    ? {
        id: user.id,
        email: user.email,
        nick: user.nick,
        nickPending: !!user.nickPending,
        verified: !!user.verified,
        premium: !!user.premium,
        local: !production,
      }
    : null;

export const ticketSecret = randomBytes(32);
const sessionTickets = new WeakMap();
const authAttempts = new WeakMap();
export const MAIL_UNAVAILABLE =
  'Cadastro e recuperação de conta estão temporariamente indisponíveis. O envio de e-mail ainda não está configurado.';
export const EMAIL_ROUTES = new Set([
  '/api/auth/register',
  '/api/auth/verify',
  '/api/auth/resend',
  '/api/auth/forgot',
  '/api/auth/reset',
]);
export const productionMode = (ctx) => ctx.production === true || ctx.config?.production === true;

// Limite também por identidade para conter tentativas distribuídas; memória limitada
// por janela e teto. Só usa cabeçalhos encaminhados quando o proxy é confiável.
export function allowAuthAttempt(req, ctx, email) {
  let attempts = authAttempts.get(ctx);
  if (!attempts) authAttempts.set(ctx, (attempts = new Map()));
  const now = Date.now();
  for (const [key, bucket] of attempts) if (bucket.until <= now) attempts.delete(key);
  const keys = [
    [`ip:${clientIp(req, ctx.config ?? {})}`, 20],
    ...(email
      ? [[`email:${createHmac('sha256', ticketSecret).update(email).digest('hex')}`, 10]]
      : []),
  ];
  for (const [key, limit] of keys) {
    const bucket = attempts.get(key);
    if (bucket && bucket.count >= limit) return false;
  }
  if (attempts.size + keys.length > 10000) return false;
  for (const [key] of keys) {
    const bucket = attempts.get(key) ?? { count: 0, until: now + 60000 };
    bucket.count += 1;
    attempts.set(key, bucket);
  }
  return true;
}

export function sessionForToken(token, state) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = state.sessions?.[token];
  if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now())
    return null;
  const user = state.users?.find((candidate) => candidate.id === session.userId);
  return user ? { token, user, expiresAt: session.expiresAt } : null;
}

export function sessionToken(req) {
  return String(req?.headers?.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('local_session='))
    ?.slice(14);
}

export function getSession(req, state) {
  return sessionForToken(sessionToken(req), state);
}

export function getUser(req, state) {
  return getSession(req, state)?.user ?? null;
}

// Captura a credencial original: um await não pode autorizar a mesma operação
// com uma sessão revogada, expirada ou substituída por outra identidade.
export function mutationSession(req, state, user) {
  const original = getSession(req, state);
  return () => {
    const current = getSession(req, state);
    if (
      !original ||
      !current ||
      current.token !== original.token ||
      current.user !== original.user ||
      current.user.id !== user?.id
    ) {
      throw Object.assign(new Error('Sua sessão expirou. Entre novamente.'), {
        status: 401,
      });
    }
    return current.user;
  };
}

// Credencial de jogo opaca; nunca expõe o cookie HttpOnly nem aceita IDs públicos.
export function issueAccountTicket(req, state, user) {
  const session = getSession(req, state);
  if (!session || !user || session.user.id !== user.id) return null;
  const ticket =
    'localv1:' + createHmac('sha256', ticketSecret).update(session.token).digest('hex');
  let tickets = sessionTickets.get(state);
  if (!tickets) sessionTickets.set(state, (tickets = new Map()));
  for (const [key, token] of tickets) if (!sessionForToken(token, state)) tickets.delete(key);
  tickets.set(ticket, session.token);
  return ticket;
}

export function resolveAccountTicket(ticket, state) {
  if (typeof ticket !== 'string' || !/^localv1:[a-f0-9]{64}$/.test(ticket)) return null;
  return sessionForToken(sessionTickets.get(state)?.get(ticket), state);
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

export async function checkPassword(password, encoded) {
  const [type, salt, hash] = String(encoded ?? '').split('$');
  if (
    type !== 'scrypt' ||
    !/^[a-f0-9]{128}$/.test(hash ?? '') ||
    !/^[a-f0-9]{32}$/.test(salt ?? '')
  )
    return false;
  const candidate = await scrypt(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

export function issueCode(user, field) {
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  user[field] = { code, expiresAt: Date.now() + CODE_MS, attempts: 0 };
  return {
    local: true,
    localCode: code,
    code,
    expiresIn: CODE_MS / 1000,
    message: `Modo local: use o código ${code}. Nenhum e-mail foi enviado.`,
  };
}

export function consumeCode(user, field, code) {
  const challenge = user?.[field];
  if (!challenge || challenge.expiresAt <= Date.now() || challenge.attempts >= 5) return false;
  challenge.attempts += 1;
  if (
    !/^\d{6}$/.test(String(code ?? '')) ||
    !timingSafeEqual(Buffer.from(challenge.code), Buffer.from(String(code)))
  )
    return false;
  delete user[field];
  return true;
}

function sessionCookie(req, res, ctx, user) {
  const now = Date.now();
  for (const [token, value] of Object.entries(ctx.state.sessions))
    if (value.expiresAt <= now) delete ctx.state.sessions[token];
  // Replace this browser's previous session after sign-in.
  const oldToken = sessionToken(req);
  if (oldToken) delete ctx.state.sessions[oldToken];
  const token = randomBytes(32).toString('hex');
  ctx.state.sessions[token] = { userId: user.id, expiresAt: now + SESSION_MS };
  res.setHeader(
    'Set-Cookie',
    `local_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${productionMode(ctx) ? '; Secure' : ''}`,
  );
  return token;
}

// Só publica a credencial depois de confirmar conta e sessão no armazenamento.
export async function durableSessionCookie(req, res, ctx, user) {
  const headers = {};
  const token = sessionCookie(
    req,
    { setHeader: (name, value) => (headers[name] = value) },
    ctx,
    user,
  );
  try {
    await durableAuthSave(ctx);
  } catch {
    // A credencial não entregue nunca deve permanecer utilizável em memória.
    delete ctx.state.sessions[token];
    return false;
  }
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  return true;
}

export async function durableAuthSave(ctx) {
  await ctx.save();
  await ctx.persistence?.flush();
}
