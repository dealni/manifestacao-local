const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/u;

function failure(deliveryState) {
  return Object.assign(new Error('Envio do código de acesso não confirmado.'), {
    deliveryState,
  });
}

function configured(config) {
  return (
    /^[a-f0-9]{32}$/iu.test(config.emailAccountId ?? '') &&
    typeof config.emailApiToken === 'string' &&
    Boolean(config.emailApiToken.trim()) &&
    !/[\r\n]/u.test(config.emailApiToken) &&
    EMAIL.test(config.emailFrom ?? '') &&
    (!config.emailReplyTo || EMAIL.test(config.emailReplyTo))
  );
}

function escapeHtml(value) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/gu, (character) => entities[character]);
}

function message(code, expiresIn) {
  const minutes = Math.max(1, Math.ceil(expiresIn / 60));
  const subject = 'Seu código de acesso Manifestações';
  const text = `Volte à tela onde solicitou o código e informe:\n\n${code}\n\nEle expira em ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} e pode ser usado uma única vez. Não compartilhe este código. Se você não solicitou, ignore este e-mail.`;
  const paragraphs = text
    .split('\n\n')
    .map(
      (paragraph) =>
        `<p style="margin:20px 0;font-size:${paragraph === code ? '32' : '16'}px;line-height:1.6;${paragraph === code ? 'font-weight:700;letter-spacing:5px;text-align:center' : ''}">${escapeHtml(paragraph)}</p>`,
    )
    .join('');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#f2faf8;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:#fff;border-top:4px solid #006b61;border-radius:12px"><tr><td style="padding:28px 24px"><p style="font-size:22px;font-weight:700;color:#006b61">Manifestações</p><h1 style="font-size:24px">${subject}</h1>${paragraphs}<p style="font-size:12px;color:#475569;border-top:1px solid #e2e8f0;padding-top:20px">Manifestações · Mensagem automática.</p></td></tr></table></body></html>`;
  return { subject, text, html };
}

function validateCode(email, code, expiresIn) {
  if (
    !EMAIL.test(email ?? '') ||
    !/^\d{6}$/u.test(code ?? '') ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw failure('failed');
  }
}

async function confirmDelivery(response, email) {
  if (response.status === 429) throw failure('retry');
  if (response.status >= 400 && response.status < 500) throw failure('failed');
  if (!response.ok) throw failure('ambiguous');
  const body = await response.json();
  const result = body?.result;
  const has = (key) => Array.isArray(result?.[key]) && result[key].includes(email);
  if (has('permanent_bounces') || has('suppressed_recipients')) throw failure('failed');
  if (body?.success !== true || !(has('accepted') || has('queued') || has('delivered')))
    throw failure('ambiguous');
}

async function releaseBody(response) {
  // Erros HTTP são decididos pelos cabeçalhos; libere o corpo não lido.
  if (response?.body && !response.bodyUsed) {
    try {
      await response.body.cancel();
    } catch {
      // Falha de limpeza não altera a classificação da entrega.
    }
  }
}

/** Only the explicit login request should call sendCode. No automatic retries. */
export function createEmailDelivery(config = {}, request = globalThis.fetch) {
  const available = Boolean(configured(config));
  const timeout = Number.isFinite(config.emailDeliveryTimeoutMs)
    ? Math.max(1, Math.min(60000, config.emailDeliveryTimeoutMs))
    : 20000;
  return {
    available,
    async sendCode({ email, code, expiresIn = 600 }) {
      if (!available) throw failure('unavailable');
      validateCode(email, code, expiresIn);
      let response;
      try {
        response = await request(
          `https://api.cloudflare.com/client/v4/accounts/${config.emailAccountId}/email/sending/send`,
          {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(timeout),
            headers: {
              Authorization: `Bearer ${config.emailApiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: { address: config.emailFrom, name: 'Manifestações' },
              to: email,
              ...(config.emailReplyTo ? { reply_to: config.emailReplyTo } : {}),
              ...message(code, expiresIn),
            }),
          },
        );
        await confirmDelivery(response, email);
        return { accepted: true };
      } catch (error) {
        if (['retry', 'failed', 'ambiguous'].includes(error?.deliveryState)) throw error;
        // Network/timeout/JSON errors may happen after the provider accepted the email.
        throw failure('ambiguous');
      } finally {
        await releaseBody(response);
      }
    },
  };
}
