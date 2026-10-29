import { ensureReferralCode, initializeWallet, walletSummary, settleReferral } from './points.js';

const PREFIX = '/api/jogos/manifestacao';
/** Read-only interface for the player's wallet. No public credit/top-up endpoint. */
export async function handlePoints(req, res, url, ctx) {
  if (![`${PREFIX}/pontos`, `${PREFIX}/pagamentos`].includes(url.pathname)) return false;
  const send = (status, payload) => {
    ctx.send(res, status, payload);
    return true;
  };
  if (url.pathname.endsWith('/pagamentos'))
    return send(503, {
      error: 'Pagamentos reais ainda não estão disponíveis.',
      paymentsEnabled: false,
      currency: 'points',
    });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(405, { error: 'Use GET para consultar seus pontos.' });
  }
  const user = ctx.user(req);
  if (!user) return send(401, { error: 'Entre com seu e-mail para consultar pontos e convites.' });
  initializeWallet(ctx.state, user);
  settleReferral(ctx.state, user);
  const code = ensureReferralCode(ctx.state, user);
  ctx.save();
  const origin = ctx.config.publicOrigin ?? `http://${req.headers.host}`;
  const ledger = Array.isArray(ctx.state.pointsLedger)
    ? ctx.state.pointsLedger
    : Object.values(ctx.state.pointsLedger ?? {});
  return send(200, {
    ...walletSummary(ctx.state, user),
    currency: 'points',
    paymentsEnabled: false,
    welcomePoints: 300,
    referral: {
      code,
      url: `${origin}/?convite=${encodeURIComponent(code)}`,
      inviterReward: 100,
      inviteeReward: 100,
      rewardedInvites: user.pointsWallet?.referralsRewarded ?? 0,
      maxRewards: 100,
    },
    ledger: ledger
      .filter((entry) => String(entry.userId) === String(user.id))
      .slice(-50)
      .reverse(),
  });
}
