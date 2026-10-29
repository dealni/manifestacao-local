import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyReferral,
  ensureReferralCode,
  initializeWallet,
  settleReferral,
  POINTS_RULES,
} from '../src/points.js';

function account(id, pending = false) {
  return { id, email: `${id}@example.test`, verified: true, nickPending: pending };
}

test('convites: teto do convidante se mantém com 102 convidados e reinício JSON', () => {
  let state = { users: [account('inviter')] };
  const inviter = state.users[0];
  initializeWallet(state, inviter);
  const code = ensureReferralCode(state, inviter);
  for (let i = 0; i < POINTS_RULES.referralsLimit + 2; i++) {
    const invited = account(`invited-${i}`, true);
    state.users.push(invited);
    assert.equal(applyReferral(state, invited, code), true);
    invited.nickPending = false;
    assert.equal(settleReferral(state, invited).ok, true);
    assert.equal(invited.pointsWallet.balance, POINTS_RULES.welcome + POINTS_RULES.referral);
  }
  assert.equal(inviter.pointsWallet.referralsRewarded, POINTS_RULES.referralsLimit);
  assert.equal(
    inviter.pointsWallet.balance,
    POINTS_RULES.welcome + POINTS_RULES.referral * POINTS_RULES.referralsLimit,
  );
  state = JSON.parse(JSON.stringify(state));
  const before = JSON.stringify(state);
  for (const invited of state.users.slice(1))
    assert.equal(settleReferral(state, invited).duplicate, true);
  assert.equal(
    JSON.stringify(state),
    before,
    'repetir liquidação após reinício não altera pontos ou histórico',
  );
});

test('convites: perda temporária de elegibilidade não dá crédito parcial e permite nova tentativa válida', () => {
  const inviter = account('inviter');
  const invited = account('invited', true);
  const state = { users: [inviter, invited] };
  initializeWallet(state, inviter);
  assert.equal(applyReferral(state, invited, inviter.referralCode), true);
  invited.nickPending = false;
  inviter.verified = false;
  assert.equal(settleReferral(state, invited).error, 'invalid_referral');
  assert.equal(invited.pointsWallet, undefined);
  assert.equal(inviter.pointsWallet.balance, POINTS_RULES.welcome);
  inviter.verified = true;
  assert.equal(settleReferral(state, invited).ok, true);
  assert.equal(invited.pointsWallet.balance, POINTS_RULES.welcome + POINTS_RULES.referral);
  assert.equal(inviter.pointsWallet.balance, POINTS_RULES.welcome + POINTS_RULES.referral);
});
