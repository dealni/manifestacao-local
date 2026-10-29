import { clientIp } from './runtime-config.js';

export function turnstileEnabled(config) {
  return !!(config?.turnstileSiteKey && config?.turnstileSecretKey);
}

/** Nunca aceitar apenas o resultado do widget no navegador. */
export async function verifyEmailChallenge(req, token, config, fetcher = fetch) {
  if (!turnstileEnabled(config)) return true;
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) return false;
  let response;
  try {
    response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: config.turnstileSecretKey,
        response: token,
        remoteip: clientIp(req, config),
      }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) return false;
    const result = await response.json();
    return (
      result.success === true &&
      result.action === 'email_login' &&
      result.hostname === new URL(config.publicOrigin).hostname
    );
  } catch {
    // Sem logs de token, segredo ou resposta do provider; falha fechada.
    return false;
  } finally {
    if (response?.body && !response.bodyUsed) {
      try {
        await response.body.cancel();
      } catch {
        // Erros de limpeza também mantêm a validação fechada.
      }
    }
  }
}

export function allowTurnstileCsp(policy) {
  return policy
    .replace(/script-src ([^;]+);/, 'script-src $1 https://challenges.cloudflare.com;')
    .replace(/connect-src ([^;]+);/, 'connect-src $1 https://challenges.cloudflare.com;')
    .replace(/frame-src [^;]+;/, "frame-src 'self' https://challenges.cloudflare.com;");
}
