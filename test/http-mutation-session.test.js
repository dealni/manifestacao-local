import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';
import { createLocalServer } from '../src/server.js';
import { initializeWallet } from '../src/points.js';

const prefix = '/api/jogos/manifestacao';
const token = 'b'.repeat(64);
const cookie = `local_session=${token}`;
const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'red' } })
  .png()
  .toBuffer();
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-http-mutation-'));
  const app = await createLocalServer({ dataDir, port: 0 });
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  const user = {
    id: 'alice',
    email: 'alice@example.test',
    nick: 'Alice',
    verified: true,
    owned: {},
  };
  const other = {
    id: 'bruno',
    email: 'bruno@example.test',
    nick: 'Bruno',
    verified: true,
    owned: {},
  };
  app.ctx.state.mediaBids = [];
  app.ctx.state.mediaPurchases = {};
  app.ctx.state.superchats = [];
  app.ctx.state.users.push(user, other);
  initializeWallet(app.ctx.state, user);
  initializeWallet(app.ctx.state, other);
  app.ctx.state.sessions[token] = { userId: user.id, expiresAt: Date.now() + 60000 };
  app.ctx.state.designs.push({
    id: 'c111111111111111',
    userId: user.id,
    filename: '1'.repeat(24) + '.png',
    paid: false,
    status: 'approved',
    kind: 'cartaz',
  });
  t.after(async () => {
    await app.close();
    fs.rmSync(dataDir, { force: true, recursive: true });
  });
  async function json(route, body) {
    const r = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json() };
  }
  function snapshot() {
    const state = app.ctx.state;
    return JSON.stringify([
      state.users,
      state.purchases,
      state.designs,
      state.media,
      state.mediaBids,
      state.mediaPurchases,
      state.superchats,
      state.pointsLedger,
    ]);
  }
  return { app, base, user, other, json, snapshot, dataDir };
}
function startSlow(f, route, body) {
  const entered = deferred();
  const original = f.app.ctx.readBody;
  f.app.ctx.readBody = async (req) => {
    if (req.url === route) entered.resolve();
    return original(req);
  };
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  let request;
  const result = new Promise((resolve, reject) => {
    request = http.request(
      f.base + route,
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': Buffer.isBuffer(body) ? 'image/png' : 'application/json',
          'content-length': bytes.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      },
    );
    request.on('error', reject);
    request.write(bytes.subarray(0, 1));
  });
  return { entered: entered.promise, finish: () => request.end(bytes.subarray(1)), result };
}
const operations = [
  ['/api/profile/nick', { nick: 'Alterado' }],
  [`${prefix}/visual`, { character: 1 }],
  [`${prefix}/pvp`, {}],
  ['/cartaz/comprar', { id: 'c111111111111111' }],
  [`${prefix}/cartaz/ativar`, { id: 'c111111111111111' }],
  ['/manifestacao/api/jogos/manifestacao/cartaz/excluir', { id: 'c111111111111111' }],
  ['/telao/lance', {}],
  [`${prefix}/telao/cancelar`, { ref: 'missing' }],
  ['/superchat', { message: 'Destaque', points: 100 }],
  [`${prefix}/cartaz?tipo=cartaz`, png],
  ['/telao/midia', png],
];
for (const mode of ['logout', 'expiração', 'troca de identidade']) {
  test(`HTTP bloqueia gravações após ${mode} enquanto recebe corpo`, async (t) => {
    for (const [route, body] of operations)
      await t.test(route, async (t) => {
        const f = await fixture(t);
        const slow = startSlow(f, route, body);
        await slow.entered;
        if (mode === 'logout') assert.equal((await f.json('/api/auth/logout', {})).status, 200);
        else if (mode === 'expiração') f.app.ctx.state.sessions[token].expiresAt = Date.now() - 1;
        else f.app.ctx.state.sessions[token].userId = f.other.id;
        const before = f.snapshot();
        slow.finish();
        const result = await slow.result;
        assert.equal(result.status, 401, JSON.stringify(result.body));
        assert.equal(f.snapshot(), before);
        assert.deepEqual(
          fs.existsSync(path.join(f.dataDir, 'uploads'))
            ? fs.readdirSync(path.join(f.dataDir, 'uploads'))
            : [],
          [],
        );
      });
  });
}

test('HTTP revalida sessão depois da sanitização Sharp sem arquivo ou reserva órfã', async (t) => {
  for (const route of [`${prefix}/cartaz`, `${prefix}/telao/midia`])
    await t.test(route, async (t) => {
      const f = await fixture(t);
      f.app.ctx.config = { ...f.app.ctx.config, production: true };
      if (route.endsWith('/cartaz')) {
        for (let i = 0; i < 18; i++)
          f.app.ctx.state.designs.push({
            id: `reserved-${i}`,
            userId: f.user.id,
            kind: 'cartaz',
            status: 'approved',
          });
      }
      const entered = deferred(),
        release = deferred();
      const original = sharp.prototype.toBuffer;
      const mock = t.mock.method(sharp.prototype, 'toBuffer', async function (...args) {
        const bytes = await original.apply(this, args);
        entered.resolve();
        await release.promise;
        return bytes;
      });
      const pending = fetch(f.base + route, {
        method: 'POST',
        headers: { cookie, 'content-type': 'image/png' },
        body: png,
      });
      await entered.promise;
      const before = f.snapshot();
      await f.json('/api/auth/logout', {});
      release.resolve();
      assert.equal((await pending).status, 401);
      mock.mock.restore();
      assert.equal(f.snapshot(), before);
      assert.equal(f.user.mediaUploadTimes, undefined);
      assert.equal(fs.existsSync(path.join(f.dataDir, 'uploads')), false);
      f.app.ctx.state.sessions[token] = { userId: f.user.id, expiresAt: Date.now() + 60000 };
      const retry = await fetch(f.base + route, {
        method: 'POST',
        headers: { cookie, 'content-type': 'image/png' },
        body: png,
      });
      assert.equal(retry.status, 200);
      assert.equal(fs.readdirSync(path.join(f.dataDir, 'uploads')).length, 1);
    });
});

test('HTTP desfaz upload expirado após escrita sem consumir quota ou reserva', async (t) => {
  for (const route of [`${prefix}/cartaz`, `${prefix}/telao/midia`])
    await t.test(route, async (t) => {
      const f = await fixture(t);
      f.app.ctx.config = { ...f.app.ctx.config, production: true };
      if (route.endsWith('/cartaz')) {
        for (let i = 0; i < 18; i++)
          f.app.ctx.state.designs.push({
            id: `reserved-write-${i}`,
            userId: f.user.id,
            kind: 'cartaz',
            status: 'approved',
          });
      }
      const before = f.snapshot();
      const originalWrite = fs.writeFileSync;
      let writes = 0;
      const mock = t.mock.method(fs, 'writeFileSync', function (target, ...args) {
        const result = originalWrite.call(this, target, ...args);
        if (String(target).startsWith(path.join(f.dataDir, 'uploads') + path.sep)) {
          writes++;
          f.app.ctx.state.sessions[token].expiresAt = Date.now() - 1;
        }
        return result;
      });
      const response = await fetch(f.base + route, {
        method: 'POST',
        headers: { cookie, 'content-type': 'image/png' },
        body: png,
      });
      mock.mock.restore();
      assert.equal(response.status, 401);
      assert.equal(writes, 1);
      assert.equal(f.snapshot(), before);
      assert.equal(f.user.mediaUploadTimes, undefined);
      assert.deepEqual(fs.readdirSync(path.join(f.dataDir, 'uploads')), []);
      f.app.ctx.state.sessions[token] = { userId: f.user.id, expiresAt: Date.now() + 60000 };
      const retry = await fetch(f.base + route, {
        method: 'POST',
        headers: { cookie, 'content-type': 'image/png' },
        body: png,
      });
      assert.equal(retry.status, 200);
      assert.equal(f.user.mediaUploadTimes.length, 1);
      assert.equal(fs.readdirSync(path.join(f.dataDir, 'uploads')).length, 1);
    });
});

test('excluir design limpa visual independente persistido e jogadores conectados', async (t) => {
  const f = await fixture(t),
    design = f.app.ctx.state.designs[0];
  design.paid = true;
  const appearance = (14 << 12) | (1 << 19) | 5;
  f.user.visual = { design: design.id, appearance };
  f.user.appearance = { design: design.id, appearance };
  f.user.design = design.id;
  const player = { id: 777, userId: f.user.id, design: design.id, appearance };
  f.app.ctx.players.set(player.id, player);
  const refreshed = [];
  f.app.ctx.refreshPlayerAppearance = (p) => refreshed.push(p.id);
  assert.equal((await f.json(`${prefix}/cartaz/excluir`, { id: design.id })).status, 200);
  assert.equal(f.user.design, undefined);
  for (const visual of [f.user.visual, f.user.appearance]) {
    assert.equal(visual.design, undefined);
    assert.equal(visual.appearance, 5);
  }
  assert.equal(player.design, null);
  assert.equal(player.appearance, 5);
  assert.deepEqual(refreshed, [777]);
  const restored = JSON.parse(JSON.stringify(f.app.ctx.state));
  assert.equal(restored.users[0].visual.design, undefined);
  assert.equal((await f.json(`${prefix}/conta`)).body.user.visual.design, undefined);
  f.app.ctx.players.delete(player.id);
});
