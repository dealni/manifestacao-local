import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOptions,
  connectionOptions,
  decodeSelfPosition,
  distribution,
  runStage,
} from '../scripts/load-test-production.mjs';
import { encodeNear } from '../src/protocol.js';

test('harness de carga permite apenas loopback e impede uso remoto por CLI ou API', async () => {
  assert.deepEqual(parseOptions().clients, [10, 20, 30]);
  for (const url of [
    'wss://manifestacoes.com/ws',
    'ws://127.0.0.1.evil.test/ws',
    'ws://127.1/ws?token=segredo',
    'ws://user@localhost/ws',
    'https://localhost/ws',
    'ws://localhost/outro',
  ])
    assert.throws(() => parseOptions(['--url', url]));
  assert.equal(parseOptions(['--url', 'ws://[::1]:5000/ws']).url, 'ws://[::1]:5000/ws');
  await assert.rejects(runStage({ url: 'wss://manifestacoes.com/ws', duration: 1 }, 1));
  for (const args of [
    ['--duration', '0'],
    ['--clients', '1001'],
    ['--clients', '1.5'],
    ['--duration', 'Infinity'],
    ['--unknown', 'x'],
  ])
    assert.throws(() => parseOptions(args));
});

test('simulação do proxy exige opt-in HTTPS e mantém destino exclusivamente loopback', () => {
  const options = parseOptions([
    '--url',
    'ws://127.0.0.1:4180/ws',
    '--origin',
    'https://manifestacoes.com',
  ]);
  assert.equal(options.url, 'ws://127.0.0.1:4180/ws');
  assert.deepEqual(connectionOptions(options, 0), {
    origin: 'https://manifestacoes.com',
    followRedirects: false,
    handshakeTimeout: 5000,
    headers: { Host: 'manifestacoes.com', 'X-Forwarded-Proto': 'https', 'X-Real-IP': '198.18.0.1' },
  });
  assert.equal(connectionOptions(options, 29).headers['X-Real-IP'], '198.18.0.30');
  assert.equal(connectionOptions(parseOptions(), 0).headers, undefined);
  assert.equal(connectionOptions(parseOptions(), 0).origin, 'http://127.0.0.1:4173');
  assert.throws(() => connectionOptions({ ...options, url: 'wss://manifestacoes.com/ws' }, 0));
  assert.throws(() => connectionOptions(options, 1000));
  for (const origin of [
    'http://manifestacoes.com',
    'https://user@manifestacoes.com',
    'https://manifestacoes.com/path',
    'https://manifestacoes.com?x=1',
    'https://manifestacoes.com#hash',
    'https://manifestacoes.com\r\nX-Real-IP: 1.2.3.4',
  ])
    assert.throws(() => parseOptions(['--origin', origin]));
});

test('harness mede posição própria no protocolo binário real e rejeita frames incompletos', () => {
  const packet = encodeNear([{ id: 7, x: 12.34, z: -56.78 }], 1, 7);
  assert.deepEqual(decodeSelfPosition(packet, 7), { x: 12.34, z: -56.78 });
  assert.equal(decodeSelfPosition(packet, 8), null);
  assert.equal(decodeSelfPosition(packet.subarray(0, 12), 7), null);
  assert.equal(decodeSelfPosition(Buffer.from([1]), 7), null);
  assert.deepEqual(distribution([9, 1, 5]), { samples: 3, p50: 5, p95: 9, max: 9 });
  assert.equal(distribution([]).p95, null);
});

test('carga aceita1000 clientes e gera IPs de benchmark distintos e válidos', () => {
  const options = parseOptions(['--clients', '1000', '--origin', 'https://manifestacoes.com']);
  assert.deepEqual(options.clients, [1000]);
  assert.equal(connectionOptions(options, 999).headers['X-Real-IP'], '198.18.3.238');
});
