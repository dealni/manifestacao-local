import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalServer } from '../src/server.js';

async function fixture(t, size) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-media-stream-'));
  const app = await createLocalServer({ port: 0, dataDir });
  const filename = 'a'.repeat(24) + '.mp4';
  const id = 'b'.repeat(24);
  const uploads = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });
  const file = fs.openSync(path.join(uploads, filename), 'w');
  if (size === undefined) fs.writeSync(file, '0123456789');
  else fs.ftruncateSync(file, size);
  fs.closeSync(file);
  app.ctx.state.media.push({ id, filename, mime: 'video/mp4' });
  const address = await app.listen();
  t.after(async () => {
    await app.close();
    fs.rmSync(dataDir, { force: true, recursive: true });
  });
  return (options) =>
    fetch(`http://127.0.0.1:${address.port}/api/jogos/manifestacao/local-media/${id}`, options);
}

test('mídia servida aceita sufixo de Range e HEAD ignora intervalos', async (t) => {
  const request = await fixture(t);
  const suffix = await request({ headers: { Range: 'bytes=-3' } });
  assert.equal(suffix.status, 206);
  assert.equal(suffix.headers.get('content-range'), 'bytes 7-9/10');
  assert.equal(await suffix.text(), '789');
  for (const range of ['bytes=0-2', 'bytes=99-', 'bytes=-0']) {
    const head = await request({ method: 'HEAD', headers: { Range: range } });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-range'), null);
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(await head.text(), '');
  }
  for (const range of ['bytes=-0', 'bytes=5-2', 'bytes=999999999999999999999-']) {
    const invalid = await request({ headers: { Range: range } });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), 'bytes */10');
    await invalid.arrayBuffer();
  }
});

test('cancelar download de mídia encerra a leitura do arquivo', async (t) => {
  let download;
  const originalPipe = fs.ReadStream.prototype.pipe;
  t.mock.method(fs.ReadStream.prototype, 'pipe', function (...args) {
    if (String(this.path).endsWith('a'.repeat(24) + '.mp4')) download = this;
    return originalPipe.apply(this, args);
  });
  t.after(() => download?.destroy());
  const size = 32 * 1024 * 1024;
  const request = await fixture(t, size);
  const controller = new AbortController();
  const response = await request({ signal: controller.signal });
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
        timer = setTimeout(() => reject(new Error('Mídia permaneceu aberta após cancelar.')), 2000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  assert.equal(download.destroyed, true);
  assert.equal(download.closed, true);
  assert.ok(download.bytesRead < size);
});

test('mídia vazia encerra a resposta sem abrir um intervalo inválido', async (t) => {
  const request = await fixture(t, 0);
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '0');
  assert.equal(await response.text(), '');
});
