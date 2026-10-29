import { createHash, randomBytes } from 'node:crypto';

// Pontos internos de jogo. Não representam dinheiro, saldo sacável ou câmbio.
export const POINTS_RULES = Object.freeze({
  version: 1,
  welcome: 300,
  referral: 100,
  referralsLimit: 100,
  ledgerLimit: 10000,
  referencesLimit: 10000,
});
const users = (state) =>
  Array.isArray(state.users) ? state.users : Object.values(state.users ?? {});
const eligible = (user) => !!user?.id && user.verified === true && user.nickPending !== true;
const now = () => new Date().toISOString();
function wallet(user) {
  if (!user?.id) throw new TypeError('Conta necessária para usar pontos.');
  user.pointsWallet ??= {
    version: 1,
    balance: 0,
    initialized: false,
    references: {},
    referralsRewarded: 0,
  };
  const result = user.pointsWallet;
  if (!Number.isSafeInteger(result.balance) || result.balance < 0)
    throw new TypeError('Saldo de pontos inválido.');
  result.references ??= {};
  result.referralsRewarded ??= 0;
  return result;
}
function validTransactionFields(amount, reason, reference) {
  return !(
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    typeof reason !== 'string' ||
    !/^[a-z0-9:_-]{1,80}$/i.test(reason) ||
    typeof reference !== 'string' ||
    reference.length < 1 ||
    reference.length > 200 ||
    // eslint-disable-next-line no-control-regex -- Remove ou rejeita controles ASCII recebidos do usuário.
    /[\u0000-\u001f\u007f]/.test(reference)
  );
}
function validate(wallet, transaction, direction) {
  const { amount, reason, reference } = transaction ?? {};
  if (!validTransactionFields(amount, reason, reference))
    return { ok: false, error: 'invalid_transaction', balance: wallet.balance };
  const previous = Object.hasOwn(wallet.references, reference)
    ? wallet.references[reference]
    : null;
  if (previous)
    return previous.amount === amount &&
      previous.reason === reason &&
      previous.direction === direction
      ? { ok: true, duplicate: true, balance: wallet.balance }
      : { ok: false, error: 'idempotency_conflict', balance: wallet.balance };
  if (Object.keys(wallet.references).length >= POINTS_RULES.referencesLimit)
    return { ok: false, error: 'reference_capacity', balance: wallet.balance };
  if (direction === 'debit' && wallet.balance < amount)
    return { ok: false, error: 'insufficient_points', balance: wallet.balance };
  if (direction === 'credit' && !Number.isSafeInteger(wallet.balance + amount))
    return { ok: false, error: 'balance_capacity', balance: wallet.balance };
  return null;
}
function transact(state, user, transaction, direction) {
  const current = wallet(user),
    invalid = validate(current, transaction, direction);
  if (invalid) return invalid;
  const { amount, reason, reference } = transaction;
  const balance = current.balance + (direction === 'credit' ? amount : -amount);
  const sequence = (state.pointsLedgerSequence ?? 0) + 1;
  const entry = {
    sequence,
    userId: String(user.id),
    direction,
    amount,
    reason,
    reference,
    balance,
    createdAt: now(),
    previousHash: state.pointsLedgerHash ?? null,
  };
  entry.hash = createHash('sha256').update(JSON.stringify(entry)).digest('hex');
  current.balance = balance;
  // Nunca podar estas referências: remover histórico de exibição não permite repetir créditos/débitos.
  Object.defineProperty(current.references, reference, {
    value: { amount, reason, direction, sequence },
    enumerable: true,
    writable: true,
    configurable: true,
  });
  state.pointsLedgerSequence = sequence;
  state.pointsLedgerHash = entry.hash;
  (state.pointsLedger ??= []).push(entry);
  if (state.pointsLedger.length > POINTS_RULES.ledgerLimit)
    state.pointsLedger.splice(0, state.pointsLedger.length - POINTS_RULES.ledgerLimit);
  return { ok: true, duplicate: false, balance, entry };
}
export const creditPoints = (state, user, transaction) =>
  transact(state, user, transaction, 'credit');
export const debitPoints = (state, user, transaction) =>
  transact(state, user, transaction, 'debit');

export function ensureReferralCode(state, user) {
  wallet(user);
  if (!user.referralCode) {
    const existing = new Set(
      users(state)
        .map((account) => account.referralCode)
        .filter(Boolean),
    );
    let code;
    do {
      code = randomBytes(9).toString('base64url');
    } while (existing.has(code));
    user.referralCode = code;
  }
  return user.referralCode;
}
export const getPointsBalance = (state, user) => (user ? wallet(user).balance : 0);

export function walletSummary(state, user) {
  const current = wallet(user);
  return {
    currency: 'points',
    balance: current.balance,
    initialized: current.initialized === true,
    welcomePoints: POINTS_RULES.welcome,
    referralPoints: POINTS_RULES.referral,
    referralCode: user.referralCode ?? null,
    referralsRewarded: current.referralsRewarded,
    referralsLimit: POINTS_RULES.referralsLimit,
    referral: {
      pending: !!user.referredBy && user.referredBy.settled !== true,
      settled: user.referredBy?.settled === true,
    },
    history: (state.pointsLedger ?? [])
      .filter((entry) => entry.userId === String(user.id))
      .slice(-20)
      .reverse()
      .map((entry) => ({ ...entry })),
  };
}
export function initializeWallet(state, user) {
  const current = wallet(user);
  if (eligible(user) && !current.initialized) {
    const granted = creditPoints(state, user, {
      amount: POINTS_RULES.welcome,
      reason: 'welcome',
      reference: `welcome:v${POINTS_RULES.version}:${user.id}`,
    });
    if (granted.ok) {
      current.initialized = true;
      current.initializedAt = now();
    }
  }
  ensureReferralCode(state, user);
  return walletSummary(state, user);
}
// O chamador deve usar somente na criação da conta; contas antigas não podem anexar convites.
export function applyReferral(state, user, code) {
  if (
    typeof code !== 'string' ||
    !/^[A-Za-z0-9_-]{12}$/.test(code) ||
    !user?.id ||
    user.nickPending !== true ||
    user.referredBy ||
    user.pointsWallet?.initialized
  )
    return false;
  const inviter = users(state).find((account) => account.referralCode === code);
  if (
    !eligible(inviter) ||
    String(inviter.id) === String(user.id) ||
    (inviter.email &&
      String(inviter.email).trim().toLowerCase() ===
        String(user.email ?? '')
          .trim()
          .toLowerCase())
  )
    return false;
  user.referredBy = {
    userId: String(inviter.id),
    version: POINTS_RULES.version,
    settled: false,
    createdAt: now(),
  };
  return true;
}
function validateReferralPair(
  user,
  inviter,
  invitedTransaction,
  inviterTransaction,
  rewardInviter,
) {
  // Pré-validação dos dois lados mantém o prêmio indivisível antes da persistência externa.
  for (const [account, transaction] of [
    [user, invitedTransaction],
    ...(rewardInviter ? [[inviter, inviterTransaction]] : []),
  ]) {
    const invalid = validate(wallet(account), transaction, 'credit');
    if (invalid && !invalid.ok) return invalid;
  }
  return null;
}
export function settleReferral(state, user) {
  if (!eligible(user) || !user.referredBy) return { ok: false, error: 'referral_not_ready' };
  if (user.referredBy.settled) return { ok: true, duplicate: true };
  const inviter = users(state).find((account) => String(account.id) === user.referredBy.userId);
  if (!eligible(inviter) || String(inviter.id) === String(user.id))
    return { ok: false, error: 'invalid_referral' };
  initializeWallet(state, user);
  initializeWallet(state, inviter);
  const inviterWallet = wallet(inviter);
  const rewardInviter = inviterWallet.referralsRewarded < POINTS_RULES.referralsLimit;
  const invitedTransaction = {
    amount: POINTS_RULES.referral,
    reason: 'referral_invited',
    reference: `referral:v1:invited:${user.id}`,
  };
  const inviterTransaction = {
    amount: POINTS_RULES.referral,
    reason: 'referral_inviter',
    reference: `referral:v1:inviter:${user.id}`,
  };
  const invalid = validateReferralPair(
    user,
    inviter,
    invitedTransaction,
    inviterTransaction,
    rewardInviter,
  );
  if (invalid) return invalid;
  const invited = creditPoints(state, user, invitedTransaction);
  const rewarded = rewardInviter ? creditPoints(state, inviter, inviterTransaction) : null;
  if (rewarded && !rewarded.duplicate) inviterWallet.referralsRewarded++;
  Object.assign(user.referredBy, {
    settled: true,
    settledAt: now(),
    inviterRewarded: rewardInviter,
  });
  return {
    ok: true,
    duplicate: false,
    invitedPoints: invited.duplicate ? 0 : POINTS_RULES.referral,
    inviterPoints: rewarded && !rewarded.duplicate ? POINTS_RULES.referral : 0,
  };
}
