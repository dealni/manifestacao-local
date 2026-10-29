import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POINTS_RULES,
  initializeWallet,
  creditPoints,
  debitPoints,
  walletSummary,
  ensureReferralCode,
  applyReferral,
  settleReferral,
} from '../src/points.js';
const setup = () => {
  const inviter = {
    id: 'one',
    email: 'one@example.test',
    verified: true,
    nickPending: false,
  };
  const invited = {
    id: 'two',
    email: 'two@example.test',
    verified: true,
    nickPending: true,
  };
  return { inviter, invited, state: { users: [inviter, invited] } };
};
test('welcome requires verified and completed nickname, once after reload', () => {
  const { state, invited } = setup();
  assert.equal(initializeWallet(state, invited).balance, 0);
  invited.nickPending = false;
  invited.verified = false;
  assert.equal(initializeWallet(state, invited).balance, 0);
  invited.verified = true;
  assert.equal(initializeWallet(state, invited).balance, 300);
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(initializeWallet(restored, restored.users[1]).balance, 300);
  assert.equal(restored.pointsLedger.length, 1);
});
test('integer wallet rejects invalid values, overdraft and idempotency conflicts', () => {
  const { state, inviter } = setup();
  initializeWallet(state, inviter);
  for (const amount of [0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(creditPoints(state, inviter, { amount, reason: 'x', reference: 'bad' }).ok, false);
  const tx = { amount: 100, reason: 'purchase', reference: 'order:one' };
  assert.equal(debitPoints(state, inviter, tx).balance, 200);
  assert.equal(debitPoints(state, inviter, tx).duplicate, true);
  assert.equal(debitPoints(state, inviter, { ...tx, amount: 10 }).error, 'idempotency_conflict');
  assert.equal(
    debitPoints(state, inviter, { ...tx, reference: 'over', amount: 201 }).error,
    'insufficient_points',
  );
  assert.equal(creditPoints(state, inviter, tx).error, 'idempotency_conflict');
  assert.equal(walletSummary(state, inviter).balance, 200);
});
test('both sides earn one referral reward only after nickname confirmation', () => {
  const { state, inviter, invited } = setup();
  const code = ensureReferralCode(state, inviter);
  assert.equal(code.length, 12);
  assert.equal(ensureReferralCode(state, inviter), code);
  assert.equal(applyReferral(state, invited, code), true);
  assert.equal(applyReferral(state, invited, code), false);
  assert.equal(settleReferral(state, invited).ok, false);
  invited.nickPending = false;
  assert.deepEqual(settleReferral(state, invited), {
    ok: true,
    duplicate: false,
    invitedPoints: 100,
    inviterPoints: 100,
  });
  assert.equal(inviter.pointsWallet.balance, 400);
  assert.equal(invited.pointsWallet.balance, 400);
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(settleReferral(restored, restored.users[1]).duplicate, true);
  assert.equal(restored.users[0].pointsWallet.balance, 400);
});
test('invalid, self, same email and old-account referrals are ignored', () => {
  const { state, inviter, invited } = setup();
  const code = ensureReferralCode(state, inviter);
  assert.equal(applyReferral(state, invited, 'unknownxxxxx'), false);
  assert.equal(applyReferral(state, invited, {}), false);
  assert.equal(applyReferral(state, inviter, code), false);
  invited.email = ' ONE@example.test ';
  assert.equal(applyReferral(state, invited, code), false);
  invited.email = 'two@example.test';
  invited.nickPending = false;
  assert.equal(applyReferral(state, invited, code), false);
});
test('inviter rewards capped while new invited account receives its bonus', () => {
  const { state, inviter, invited } = setup();
  initializeWallet(state, inviter);
  inviter.pointsWallet.referralsRewarded = POINTS_RULES.referralsLimit;
  assert.equal(applyReferral(state, invited, inviter.referralCode), true);
  invited.nickPending = false;
  assert.equal(settleReferral(state, invited).inviterPoints, 0);
  assert.equal(invited.pointsWallet.balance, 400);
  assert.equal(inviter.pointsWallet.balance, 300);
});
test('history pruning preserves durable references and auditable hash chain', () => {
  const { state, inviter } = setup();
  initializeWallet(state, inviter);
  const first = state.pointsLedger[0];
  state.pointsLedger = Array.from({ length: POINTS_RULES.ledgerLimit }, () => ({
    ...first,
  }));
  const credited = creditPoints(state, inviter, {
    amount: 1,
    reason: 'test',
    reference: '__proto__',
  });
  assert.equal(credited.ok, true);
  assert.equal(state.pointsLedger.length, POINTS_RULES.ledgerLimit);
  assert.equal(credited.entry.previousHash, first.hash);
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(
    creditPoints(restored, restored.users[0], {
      amount: 1,
      reason: 'test',
      reference: '__proto__',
    }).duplicate,
    true,
  );
  assert.equal(initializeWallet(restored, restored.users[0]).balance, 301);
  assert.equal(walletSummary(restored, restored.users[0]).history.length, 20);
});
test('reference capacity fails closed without forgetting old debits', () => {
  const { state, inviter } = setup();
  initializeWallet(state, inviter);
  inviter.pointsWallet.references = Object.fromEntries(
    Array.from({ length: POINTS_RULES.referencesLimit }, (_, i) => [
      `r${i}`,
      { amount: 1, reason: 'purchase', direction: 'debit' },
    ]),
  );
  assert.equal(
    debitPoints(state, inviter, {
      amount: 1,
      reason: 'purchase',
      reference: 'new',
    }).error,
    'reference_capacity',
  );
  assert.equal(
    debitPoints(state, inviter, {
      amount: 1,
      reason: 'purchase',
      reference: 'r0',
    }).duplicate,
    true,
  );
  assert.equal(inviter.pointsWallet.balance, 300);
});
test('referral preflight avoids crediting only one side if capacity unavailable', () => {
  const { state, inviter, invited } = setup();
  initializeWallet(state, inviter);
  applyReferral(state, invited, inviter.referralCode);
  invited.nickPending = false;
  initializeWallet(state, invited);
  inviter.pointsWallet.references = Object.fromEntries(
    Array.from({ length: POINTS_RULES.referencesLimit }, (_, i) => [`r${i}`, {}]),
  );
  assert.equal(settleReferral(state, invited).error, 'reference_capacity');
  assert.equal(invited.pointsWallet.balance, 300);
  assert.equal(invited.referredBy.settled, false);
});
