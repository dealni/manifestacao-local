import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createLocalServer } from '../src/server.js';

async function fixture(t, setup = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-http-cache-'));
  const publicDir = path.join(root, 'public');
  fs.mkdirSync(publicDir);
  fs.writeFileSync(path.join(publicDir, 'sample.js'), '0123456789');
  setup(root, publicDir);
  const app = await createLocalServer({
    port: 0,
    publicDir,
    dataDir: path.join(root, 'data'),
  });
  const address = await app.listen();
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { force: true, recursive: true });
  });
  const request = (route, options) => fetch(`http://127.0.0.1:${address.port}${route}`, options);
  request.raw = (route) =>
    new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port: address.port, path: route }, (res) => {
        res.resume();
        res.once('end', () => resolve(res.statusCode));
        res.once('error', reject);
      });
      req.once('error', reject);
    });
  return request;
}

test('estáticos revalidam sem retransmitir e respeitam precedência de validadores', async (t) => {
  const request = await fixture(t);
  const initial = await request('/sample.js');
  const etag = initial.headers.get('etag');
  const modified = initial.headers.get('last-modified');
  assert.ok(etag);
  assert.ok(modified);
  assert.equal(await initial.text(), '0123456789');
  for (const headers of [
    { 'If-None-Match': etag },
    { 'If-None-Match': `"other", ${etag}` },
    { 'If-None-Match': '*' },
    { 'If-Modified-Since': modified },
  ]) {
    const response = await request('/sample.js', { headers });
    assert.equal(response.status, 304);
    assert.equal(await response.text(), '');
  }
  const changed = await request('/sample.js', {
    headers: {
      'If-None-Match': '"stale"',
      'If-Modified-Since': modified,
    },
  });
  assert.equal(changed.status, 200);
  assert.equal(await changed.text(), '0123456789');
});

test('HEAD ignora Range e conserva tamanho e status da representação completa', async (t) => {
  const request = await fixture(t);
  for (const range of ['bytes=0-2', 'bytes=999-', 'bytes=-0']) {
    const response = await request('/sample.js', { method: 'HEAD', headers: { Range: range } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-length'), '10');
    assert.equal(response.headers.get('content-range'), null);
    assert.equal(await response.text(), '');
  }
});

test('estáticos não seguem links para arquivos ou diretórios fora de public', async (t) => {
  const request = await fixture(t, (root, publicDir) => {
    fs.writeFileSync(path.join(root, 'private.txt'), 'conteúdo privado');
    fs.symlinkSync(path.join(root, 'private.txt'), path.join(publicDir, 'leak.txt'));
    fs.mkdirSync(path.join(root, 'private'));
    fs.writeFileSync(path.join(root, 'private', 'secret.txt'), 'conteúdo privado');
    fs.symlinkSync(path.join(root, 'private'), path.join(publicDir, 'linked'));
    fs.symlinkSync(path.join(publicDir, 'sample.js'), path.join(publicDir, 'internal.js'));
  });
  for (const route of ['/leak.txt', '/linked/secret.txt']) {
    const response = await request(route);
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /conteúdo privado/);
  }
  const internal = await request('/internal.js');
  assert.equal(internal.status, 200);
  assert.equal(await internal.text(), '0123456789');
});

test('método inválido em estático anuncia os métodos permitidos', async (t) => {
  const request = await fixture(t);
  const response = await request('/sample.js', { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD, OPTIONS');
  await response.arrayBuffer();
});

test('If-Range obsoleto entrega arquivo completo e valores inválidos são rejeitados', async (t) => {
  const request = await fixture(t);
  const initial = await request('/sample.js', { method: 'HEAD' });
  const modified = initial.headers.get('last-modified');
  const full = await request('/sample.js', {
    headers: {
      Range: 'bytes=0-2',
      'If-Range': 'Thu, 01 Jan 1970 00:00:00 GMT',
    },
  });
  assert.equal(full.status, 200);
  assert.equal(await full.text(), '0123456789');
  const range = await request('/sample.js', {
    headers: { Range: 'bytes=0-2', 'If-Range': modified },
  });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), '012');
  for (const value of ['bytes=999999999999999999999999999-', 'bytes=-0', 'bytes=5-2']) {
    const response = await request('/sample.js', { headers: { Range: value } });
    assert.equal(response.status, 416);
    await response.arrayBuffer();
  }
});

test('URL com escape inválido retorna erro do cliente sem quebrar o servidor', async (t) => {
  const request = await fixture(t);
  const malformed = await request('/%E0%A4%A');
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error, /Caminho inválido/);
  const healthy = await request('/health');
  assert.equal(healthy.status, 200);
  await healthy.arrayBuffer();
});

test('HTTP rejeita request-target com autoridade implícita ou fragmento antes do roteamento', async (t) => {
  const request = await fixture(t);
  for (const route of ['/\\outside.test/health', '/health#fragment', '/health#', '/\\health']) {
    assert.equal(await request.raw(route), 400, route);
  }
  const healthy = await request('/health');
  assert.equal(healthy.status, 200);
  await healthy.arrayBuffer();
});

test('cancelar download estático fecha a leitura e libera o arquivo', async (t) => {
  let download;
  const originalPipe = fs.ReadStream.prototype.pipe;
  t.mock.method(fs.ReadStream.prototype, 'pipe', function (...args) {
    if (String(this.path).endsWith('large.bin')) download = this;
    return originalPipe.apply(this, args);
  });
  t.after(() => download?.destroy());
  const request = await fixture(t, (_root, publicDir) => {
    const file = fs.openSync(path.join(publicDir, 'large.bin'), 'w');
    fs.ftruncateSync(file, 32 * 1024 * 1024);
    fs.closeSync(file);
  });
  const controller = new AbortController();
  const response = await request('/large.bin', { signal: controller.signal });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  await reader.read();
  assert.ok(download);
  const closed = new Promise((resolve) => download.once('close', resolve));
  controller.abort();
  let timer;
  try {
    await Promise.race([
      closed,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Arquivo permaneceu aberto após cancelar.')),
          2000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  assert.equal(download.destroyed, true);
  assert.equal(download.closed, true);
  assert.ok(download.bytesRead < 32 * 1024 * 1024);
  const healthy = await request('/health');
  assert.equal(healthy.status, 200);
  await healthy.arrayBuffer();
});
