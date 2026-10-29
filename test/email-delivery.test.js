import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailDelivery } from '../src/email-delivery.js';

const config = {
  emailAccountId: 'a'.repeat(32),
  emailApiToken: 'test-token-never-real',
  emailFrom: 'acesso@manifestacoes.example',
  emailReplyTo: 'ajuda@manifestacoes.example',
};
const payload = { email: 'pessoa@example.com', code: '012345', expiresIn: 600 };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('email delivery accepts the production sender and ordinary recipient via mock', async () => {
  const recipient = 'diogo@example.com';
  let calls = 0;
  const sender = createEmailDelivery(
    { ...config, emailFrom: 'acesso@manifestacoes.com' },
    async (_url, options) => {
      calls++;
      const body = JSON.parse(options.body);
      assert.equal(body.from.address, 'acesso@manifestacoes.com');
      assert.equal(body.to, recipient);
      return response({ success: true, result: { queued: [recipient] } });
    },
  );
  assert.equal(sender.available, true);
  assert.deepEqual(await sender.sendCode({ ...payload, email: recipient }), {
    accepted: true,
  });
  assert.equal(calls, 1);
});

test('email delivery stays unavailable without valid configuration', async () => {
  for (const invalid of [
    {},
    { ...config, emailAccountId: 'bad' },
    { ...config, emailApiToken: 'a\r\nb' },
    { ...config, emailFrom: 'bad' },
    { ...config, emailReplyTo: 'bad' },
  ]) {
    const sender = createEmailDelivery(invalid, () => assert.fail('must not send'));
    assert.equal(sender.available, false);
    await assert.rejects(sender.sendCode(payload), {
      deliveryState: 'unavailable',
    });
  }
});

for (const state of ['accepted', 'queued', 'delivered']) {
  test(`email delivery confirms ${state} for the intended recipient`, async () => {
    let calls = 0;
    const sender = createEmailDelivery(config, async (url, options) => {
      calls++;
      assert.equal(
        url,
        `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/email/sending/send`,
      );
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.headers.Authorization, 'Bearer test-token-never-real');
      const body = JSON.parse(options.body);
      assert.equal(body.to, payload.email);
      assert.deepEqual(body.from, {
        address: config.emailFrom,
        name: 'Manifestações',
      });
      assert.equal(body.reply_to, config.emailReplyTo);
      assert.match(body.subject, /código de acesso Manifestações/);
      assert.match(body.text, /012345/);
      assert.match(body.text, /10 minutos/);
      assert.match(body.html, /lang="pt-BR"/);
      assert.ok(!body.html.includes('<script'));
      return response({ success: true, result: { [state]: [payload.email] } });
    });
    assert.equal(sender.available, true);
    assert.deepEqual(await sender.sendCode(payload), { accepted: true });
    assert.equal(calls, 1);
  });
}

test('email delivery refuses unconfirmed and rejected recipients without retry', async () => {
  for (const [body, status, deliveryState] of [
    [{ success: true, result: { queued: ['other@example.com'] } }, 200, 'ambiguous'],
    [{ success: false, result: { queued: [payload.email] } }, 200, 'ambiguous'],
    [
      {
        success: true,
        result: { queued: [payload.email], permanent_bounces: [payload.email] },
      },
      200,
      'failed',
    ],
    [{ success: true, result: { suppressed_recipients: [payload.email] } }, 200, 'failed'],
    [{}, 429, 'retry'],
    [{}, 403, 'failed'],
    [{}, 500, 'ambiguous'],
    [null, 200, 'ambiguous'],
  ]) {
    let calls = 0;
    const sender = createEmailDelivery(config, async () => {
      calls++;
      return response(body, status);
    });
    await assert.rejects(sender.sendCode(payload), {
      message: 'Envio do código de acesso não confirmado.',
      deliveryState,
    });
    assert.equal(calls, 1);
  }
});

test('email delivery hides provider/network details and malformed responses', async () => {
  for (const request of [
    async () => {
      throw Error(`secret ${config.emailApiToken}`);
    },
    async () => new Response('secret invalid JSON'),
  ]) {
    const sender = createEmailDelivery(config, request);
    await assert.rejects(sender.sendCode(payload), {
      message: 'Envio do código de acesso não confirmado.',
      deliveryState: 'ambiguous',
    });
  }
});

test('email delivery aborts timed out requests and does not retry', async () => {
  let calls = 0;
  const sender = createEmailDelivery(
    { ...config, emailDeliveryTimeoutMs: 5 },
    async (_url, { signal }) => {
      calls++;
      return new Promise((_resolve, reject) => {
        const timer = setTimeout(() => reject(Error('timeout guard')), 1000);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true },
        );
      });
    },
  );
  await assert.rejects(sender.sendCode(payload), {
    deliveryState: 'ambiguous',
  });
  assert.equal(calls, 1);
});

test('email delivery validates recipients, code and expiration before sending', async () => {
  const sender = createEmailDelivery(config, () => assert.fail('must not send'));
  for (const invalid of [
    { ...payload, email: 'a\nb@example.com' },
    { ...payload, code: '<img>' },
    { ...payload, expiresIn: Infinity },
    { ...payload, expiresIn: -1 },
  ]) {
    await assert.rejects(sender.sendCode(invalid), { deliveryState: 'failed' });
  }
});

test('email delivery releases unread HTTP error bodies without changing delivery state', async () => {
  for (const [status, deliveryState] of [
    [429, 'retry'],
    [403, 'failed'],
    [500, 'ambiguous'],
  ]) {
    let canceled = false;
    const body = new ReadableStream({
      cancel() {
        canceled = true;
      },
    });
    const sender = createEmailDelivery(config, async () => new Response(body, { status }));
    await assert.rejects(sender.sendCode(payload), { deliveryState });
    assert.equal(canceled, true);
  }
  const sender = createEmailDelivery(config, async () => ({
    status: 403,
    ok: false,
    bodyUsed: false,
    body: {
      cancel: async () => {
        throw Error('cleanup');
      },
    },
  }));
  await assert.rejects(sender.sendCode(payload), { deliveryState: 'failed' });
});
