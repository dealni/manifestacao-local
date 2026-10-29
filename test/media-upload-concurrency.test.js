import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleMedia } from '../src/media.js';
import { createPersistence } from '../src/persistence.js';
import { sessionRequest } from './session-fixture.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
function setup(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-upload-concurrency-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const user = { id: 'upload-user', nick: 'Teste', verified: true };
  const ctx = {
    dataDir,
    config: { production: false },
    freeAccess: true,
    state: { users: [user], designs: [], media: [] },
    user: () => user,
    account: () => ({}),
    readBody: async () => png,
    save() {},
    send(res, status, payload) {
      Object.assign(res, { status, payload });
    },
  };
  async function upload(route) {
    const res = {};
    await handleMedia(
      sessionRequest(ctx, { method: 'POST', headers: {} }),
      res,
      new URL(`http://localhost/api/jogos/manifestacao${route}`),
      ctx,
    );
    return res;
  }
  return { ctx, user, upload };
}

for (const route of ['/cartaz', '/telao/midia']) {
  test(`uploads simultâneos ${route} respeitam dez publicações por minuto`, async (t) => {
    const { ctx, user, upload } = setup(t);
    const results = await Promise.all(Array.from({ length: 15 }, () => upload(route)));
    assert.equal(results.filter((res) => res.status === 200).length, 10);
    assert.equal(results.filter((res) => res.status === 429).length, 5);
    assert.equal(user.mediaUploadTimes.length, 10);
    assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 10);
  });

  test(`uploads simultâneos ${route} reservam bytes da conta antes de publicar`, async (t) => {
    const { ctx, upload } = setup(t);
    ctx.state.media.push({
      id: 'existing',
      userId: 'upload-user',
      filename: 'existing.webp',
      size: 200 * 1024 * 1024 - png.length,
    });
    const results = await Promise.all([upload(route), upload(route)]);
    assert.deepEqual(results.map((res) => res.status).sort(), [200, 413]);
    assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 1);
    // Depois da publicação, a reserva transitória não deve continuar ocupando cota.
    ctx.state.media = [];
    ctx.state.designs = [];
    assert.equal((await upload(route)).status, 200);
  });
}

for (const route of ['/cartaz', '/telao/midia?aspect=16:9,9:16']) {
  test(`falha ao salvar upload ${route} desfaz variantes e consumo de cota sem arriscar bytes persistidos`, async (t) => {
    const { ctx, user, upload } = setup(t);
    const previousTimes = [Date.now() - 120000];
    user.mediaUploadTimes = previousTimes;
    const existing = { id: 'existing', userId: user.id, filename: 'existing.webp', size: 1 };
    ctx.state.media.push(existing);
    ctx.save = () => {
      throw Error('storage unavailable');
    };
    const failed = await upload(route);
    assert.equal(failed.status, 500);
    assert.deepEqual(ctx.state.designs, []);
    assert.deepEqual(ctx.state.media, [existing]);
    assert.equal(user.mediaUploadTimes, previousTimes);
    assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 1);
    ctx.save = () => {};
    assert.equal((await upload(route)).status, 200);
    assert.equal(user.mediaUploadTimes.length, 2);
    assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 2);
  });
}

for (const route of ['/cartaz', '/telao/midia?aspect=16:9,9:16']) {
  test(`upload ${route} preserva arquivo referenciado após falha de fsync posterior ao rename`, async (t) => {
    const { ctx, upload } = setup(t);
    const persistence = await createPersistence({
      dataDir: ctx.dataDir,
      config: { production: false },
      defaults: ctx.state,
    });
    ctx.save = () => persistence.save(ctx.state);
    const originalSync = fs.fsyncSync;
    const sync = t.mock.method(fs, 'fsyncSync', (fd) => {
      if (fs.fstatSync(fd).isDirectory()) throw Error('directory fsync unavailable');
      return originalSync(fd);
    });
    assert.equal((await upload(route)).status, 500);
    sync.mock.restore();
    await assert.rejects(persistence.close());
    const reopened = await createPersistence({
      dataDir: ctx.dataDir,
      config: { production: false },
    });
    const records = [...reopened.state.designs, ...reopened.state.media];
    assert.equal(records.length, route === '/cartaz' ? 1 : 2);
    for (const record of records)
      assert.deepEqual(fs.readFileSync(path.join(ctx.dataDir, 'uploads', record.filename)), png);
    await reopened.close();
  });
}
