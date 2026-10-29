import test from 'node:test';
import assert from 'node:assert/strict';
import { handleLocalUpgrade } from '../src/upgrade.js';
import { createRuntimeConfig } from '../src/runtime-config.js';

const runtime = () =>
  createRuntimeConfig(
    {},
    {
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: 'https://manifestacoes.com',
    },
  );
function harness(config = runtime(), handshakeLimits) {
  const connections = [];
  const realtime = {
    wss: {
      handleUpgrade(req, socket, head, callback) {
        callback({ service: 'game' });
      },
      emit(event, ws, req) {
        connections.push({ event, ws, req });
      },
    },
  };
  return {
    connections,
    request({ url = '/ws', headers = {}, ip = '127.0.0.1' } = {}) {
      let destroyed = false;
      const req = {
        url,
        headers: { host: 'manifestacoes.com', origin: 'https://manifestacoes.com', ...headers },
        socket: { remoteAddress: ip },
      };
      handleLocalUpgrade(
        req,
        {
          destroy() {
            destroyed = true;
          },
        },
        Buffer.alloc(0),
        { realtime, runtime: config, handshakeLimits },
      );
      return destroyed;
    },
  };
}

test('produção permite o WebSocket do jogo somente no domínio e origem configurados', () => {
  const h = harness();
  assert.equal(h.request(), false);
  assert.equal(h.request({ url: '/local-voice' }), true);
  assert.deepEqual(
    h.connections.map((c) => c.ws.service),
    ['game'],
  );
  for (const headers of [
    { origin: undefined },
    { origin: 'https://evil.test' },
    { origin: 'http://manifestacoes.com' },
    { origin: 'https://manifestacoes.com.evil.test' },
    { host: 'localhost' },
    { origin: 'https://manifestacoes.com/path' },
    { origin: 'not-an-origin' },
  ])
    assert.equal(h.request({ headers }), true, JSON.stringify(headers));
  assert.equal(h.connections.length, 1);
});

test('produção descarta destinos absolutos, caminhos desconhecidos e URLs inválidas', () => {
  const h = harness();
  for (const url of [
    'https://manifestacoes.com/ws',
    '//evil.test/ws',
    '/\\evil.test/ws',
    '/unknown',
    '/ws#fragment',
    'http://[',
  ]) {
    assert.equal(h.request({ url }), true, url);
  }
  assert.equal(h.connections.length, 0);
});

test('limite de handshake do jogo não aceita IP encaminhado de origem não confiável', () => {
  const h = harness(runtime(), { maxAttempts: 2 });
  assert.equal(h.request({ ip: '198.51.100.8' }), false);
  assert.equal(h.request({ ip: '198.51.100.8' }), false);
  assert.equal(
    h.request({
      ip: '198.51.100.8',
      headers: { 'x-forwarded-for': '192.0.2.10', 'cf-connecting-ip': '192.0.2.11' },
    }),
    true,
  );
  assert.equal(h.request({ ip: '198.51.100.9' }), false);
  assert.equal(h.connections.length, 3);
});

test('limite expira e tamanho de tabela é limitado', async () => {
  const h = harness(runtime(), { maxAttempts: 1, maxAddresses: 1, windowMs: 5 });
  assert.equal(h.request({ ip: '198.51.100.1' }), false);
  assert.equal(h.request({ ip: '198.51.100.2' }), true);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(h.request({ ip: '198.51.100.2' }), false);
});

test('modo local com runtime preserva clientes de teste sem Origin', () => {
  const config = createRuntimeConfig({}, { NODE_ENV: 'test' });
  const h = harness(config);
  assert.equal(h.request({ headers: { host: 'localhost:4173', origin: undefined } }), false);
});

test('upgrade compara autoridades normalizadas para Host com caixa e porta padrão', () => {
  const production = harness();
  assert.equal(production.request({ headers: { host: 'MANIFESTACOES.COM' } }), false);
  const local = harness(createRuntimeConfig({}, { NODE_ENV: 'test' }));
  for (const [host, origin] of [
    ['LOCALHOST:4173', 'http://localhost:4173'],
    ['localhost:80', 'http://localhost'],
  ]) {
    assert.equal(local.request({ headers: { host, origin } }), false, host);
  }
  assert.equal(production.connections.length, 1);
  assert.equal(local.connections.length, 2);
});
