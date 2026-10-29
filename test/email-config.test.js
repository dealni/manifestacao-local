import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntimeConfig } from '../src/runtime-config.js';

test('produção exige segredo estável quando transporte de e-mail é ativado', () => {
  const env = {
    NODE_ENV: 'production',
    PUBLIC_ORIGIN: 'https://manifestacoes.com',
    CLOUDFLARE_EMAIL_API_TOKEN: 'fake-test-token',
  };
  assert.throws(() => loadRuntimeConfig({}, env), /EMAIL_CODE_SECRET/);
  assert.throws(
    () => loadRuntimeConfig({}, { ...env, EMAIL_CODE_SECRET: 'curto' }),
    /EMAIL_CODE_SECRET/,
  );
  const config = loadRuntimeConfig(
    {},
    {
      ...env,
      EMAIL_CODE_SECRET: 'x'.repeat(32),
      CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
      CLOUDFLARE_EMAIL_FROM: 'acesso@manifestacoes.com',
    },
  );
  assert.equal(config.emailCodeSecret.length, 32);
  assert.equal(config.emailDeliveryTimeoutMs, 20000);
  assert.equal(config.emailFrom, 'acesso@manifestacoes.com');
  assert.equal(config.emailReplyTo, '');
});

test('configuração parcial de e-mail não é interpretada como timeout ilimitado', () => {
  assert.throws(
    () => loadRuntimeConfig({}, { EMAIL_DELIVERY_TIMEOUT_MS: '0' }),
    /EMAIL_DELIVERY_TIMEOUT_MS/,
  );
  assert.throws(
    () => loadRuntimeConfig({}, { EMAIL_DELIVERY_TIMEOUT_MS: '60001' }),
    /EMAIL_DELIVERY_TIMEOUT_MS/,
  );
});
