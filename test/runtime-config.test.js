import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  loadRuntimeConfig,
  createRuntimeConfig,
  isAllowedHost,
  isAllowedOrigin,
  requestProtocol,
  isTrustedProxy,
  clientIp,
  createRateLimiter,
} from '../src/runtime-config.js';

const prod = () =>
  createRuntimeConfig({}, { NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://manifestacoes.com' });
const request = (headers = {}, remoteAddress = '127.0.0.1') => ({
  headers,
  socket: { remoteAddress },
});

test('configuração local preserva loopback e diretórios padrão', () => {
  const config = loadRuntimeConfig({}, {});
  assert.equal(config.production, false);
  assert.equal(config.port, 4173);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.secureCookies, false);
  assert.equal(config.dataDir, fileURLToPath(new URL('../data', import.meta.url)));
  assert.equal(config.maxBodyBytes, 20 * 1024 * 1024);
  assert.equal(config.maxPlayers, 1000);
  assert.equal(config.wsMaxConnections, 1200);
  assert.equal(config.databaseUrl, null);
});

test('produção exige origem HTTPS sem credenciais/caminhos', () => {
  for (const origin of [
    undefined,
    'http://manifestacoes.com',
    'https://user:pass@manifestacoes.com',
    'https://manifestacoes.com/path',
    'https://manifestacoes.com/#x',
    'https://manifestacoes.com/?x=1',
  ]) {
    assert.throws(() => loadRuntimeConfig({}, { NODE_ENV: 'production', PUBLIC_ORIGIN: origin }));
  }
  const config = prod();
  assert.equal(config.production, true);
  assert.equal(config.secureCookies, true);
  assert.equal(config.publicHost, 'manifestacoes.com');
  assert.equal(config.maxPlayers, 1000);
});

test('opções/env definem banco, diretórios e limites com validação', () => {
  const config = loadRuntimeConfig(
    { port: 0 },
    {
      PORT: '5000',
      DATA_DIR: '/tmp/brasilia-data',
      DATABASE_URL: 'postgresql://example',
      MAX_PLAYERS: '40',
    },
  );
  assert.equal(config.port, 0);
  assert.equal(config.dataDir, '/tmp/brasilia-data');
  assert.equal(config.databaseUrl, 'postgresql://example');
  assert.equal(config.maxPlayers, 40);
  for (const env of [
    { MAX_PLAYERS: '0' },
    { PORT: 'NaN' },
    { MAX_BODY_BYTES: '-1' },
    { HOST: '0.0.0.0' },
  ])
    assert.throws(() => loadRuntimeConfig({}, env));
});

test('allowlist de Host/Origin pública não aceita sufixos ou protocolo diferente', () => {
  const config = prod();
  assert.equal(isAllowedHost(request({ host: 'manifestacoes.com' }), config), true);
  for (const host of [
    'manifestacoes.com.evil.test',
    'evil.test',
    'localhost',
    'manifestacoes.com:443',
    'manifestacoes.com, evil.test',
    'manifestacoes.com@evil.test',
    'manifestacoes.com\n',
  ])
    assert.equal(isAllowedHost(request({ host }), config), false, host);
  assert.equal(isAllowedOrigin(request({ origin: 'https://manifestacoes.com' }), config), true);
  for (const origin of [
    'http://manifestacoes.com',
    'null',
    'https://manifestacoes.com.evil.test',
    'https://manifestacoes.com/',
    'https://a@manifestacoes.com',
  ])
    assert.equal(isAllowedOrigin(request({ origin }), config), false, origin);
  assert.equal(isAllowedOrigin(request(), config), true);
  assert.equal(isAllowedOrigin(request(), config, { allowMissing: false }), false);
});

test('local permite apenas origem local correspondente ao Host', () => {
  const config = loadRuntimeConfig({}, {});
  for (const host of ['localhost:4173', '127.0.0.1:4173', '[::1]:4173']) {
    assert.equal(isAllowedHost(request({ host }), config), true);
    assert.equal(isAllowedOrigin(request({ host, origin: `http://${host}` }), config), true);
  }
  assert.equal(
    isAllowedOrigin(request({ host: 'localhost:4173', origin: 'http://localhost:9999' }), config),
    false,
  );
  assert.equal(isAllowedHost(request({ host: '127.0.0.1.evil.test' }), config), false);
});

test('Host local rejeita porta fora do intervalo antes de construir a URL', () => {
  const config = loadRuntimeConfig({}, {});
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(isAllowedHost(request({ host: `${hostname}:65535` }), config), true);
    for (const port of ['65536', '99999', '123456', '-1', ''])
      assert.equal(isAllowedHost(request({ host: `${hostname}:${port}` }), config), false);
  }
});

test('Origin local compara Host sem distinção de caixa e com porta padrão normalizada', () => {
  const config = loadRuntimeConfig({}, {});
  for (const [host, origin] of [
    ['LOCALHOST:4173', 'http://localhost:4173'],
    ['localhost:80', 'http://localhost'],
    ['localhost:443', 'https://localhost'],
    ['[::1]:80', 'http://[::1]'],
  ]) {
    assert.equal(isAllowedOrigin(request({ host, origin }), config), true, host);
  }
  assert.equal(
    isAllowedOrigin(request({ host: 'localhost:65536', origin: 'http://localhost' }), config),
    false,
  );
});

test('headers encaminhados são ignorados fora de proxy loopback', () => {
  const config = prod();
  const external = request(
    { 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.8', 'x-forwarded-proto': 'https' },
    '192.0.2.1',
  );
  assert.equal(isTrustedProxy(external, config), false);
  assert.equal(clientIp(external, config), '192.0.2.1');
  assert.equal(requestProtocol(external, config), 'http');
  const trusted = request(external.headers);
  assert.equal(clientIp(trusted, config), '203.0.113.7');
  assert.equal(requestProtocol(trusted, config), 'https');
  assert.equal(clientIp(request({ 'x-forwarded-for': '198.51.100.8' }), config), '127.0.0.1');
  assert.equal(clientIp(request({ 'x-real-ip': '203.0.113.7, 1.1.1.1' }), config), '127.0.0.1');
  assert.equal(requestProtocol(request({ 'x-forwarded-proto': 'https,http' }), config), 'http');
  assert.equal(clientIp(trusted, { ...config, trustProxy: false }), '127.0.0.1');
});

test('rate limiter limita por IP e janela sem crescimento irrestrito', () => {
  let time = 0;
  const config = prod();
  const limiter = createRateLimiter(config, { now: () => time, maxEntries: 2 });
  const first = request({}, '192.0.2.1');
  assert.equal(limiter.check(first, { limit: 2 }).allowed, true);
  assert.equal(limiter.check(first, { limit: 2 }).remaining, 0);
  assert.deepEqual(limiter.check(first, { limit: 2 }), {
    allowed: false,
    remaining: 0,
    retryAfter: 60,
  });
  assert.equal(limiter.check(request({}, '192.0.2.2')).allowed, true);
  assert.equal(limiter.check(request({}, '192.0.2.3')).allowed, false);
  assert.equal(limiter.size, 2);
  time = 60001;
  assert.equal(limiter.check(first, { limit: 2 }).allowed, true);
  assert.equal(limiter.check(request({}, '192.0.2.3')).allowed, true);
  assert.ok(limiter.size <= 2);
});
