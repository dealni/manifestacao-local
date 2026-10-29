import { sessionRequest } from './session-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { handleMedia } from '../src/media.js';
import { initializeWallet, walletSummary } from '../src/points.js';
const png = await sharp({
  create: { width: 2, height: 2, channels: 4, background: 'red' },
})
  .png()
  .toBuffer();
function setup(t, config = { production: true }) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-prod-media-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const user = { id: 'u1', nick: 'Pessoa', verified: true, nickPending: false };
  const ctx = {
    config,
    dataDir,
    state: {},
    saves: 0,
    user: () => user,
    account: () => ({}),
    save() {
      this.saves++;
    },
    send(res, status, payload) {
      Object.assign(res, { status, payload });
    },
    readBody: async (req) => req.data,
    body: async (req) => JSON.parse(req.data.toString()),
  };
  ctx.state.users = [user];
  initializeWallet(ctx.state, user);
  const request = async (route, data = {}, peer = '127.0.0.1') => {
    const res = {};
    await handleMedia(
      sessionRequest(ctx, {
        method: 'POST',
        headers: {},
        socket: { remoteAddress: peer },
        data: Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data)),
      }),
      res,
      new URL('http://localhost/api/jogos/manifestacao' + route),
      ctx,
    );
    return res;
  };
  return { ctx, request };
}
test('produção aceita imagens estáticas de conta confirmada sem debitar upload', async (t) => {
  const { ctx, request } = setup(t);
  for (const route of ['/cartaz', '/telao/midia'])
    assert.equal((await request(route, png)).status, 200);
  assert.equal(walletSummary(ctx.state, ctx.state.users[0]).balance, 300);
  assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 2);
});
test('conta explicitamente autorizada pode enviar e conta excedida não escreve arquivo', async (t) => {
  const { ctx, request } = setup(t, {
    production: true,
    mediaUploadUserIds: ['u1'],
  });
  assert.equal((await request('/cartaz', png)).status, 200);
  ctx.state.designs.push({
    filename: 'quota.png',
    userId: 'u1',
    size: 200 * 1024 * 1024,
  });
  assert.equal((await request('/telao/midia', png)).status, 413);
  assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 1);
});
test('produção agrega audiência e limita pedidos repetidos do mesmo endereço', async (t) => {
  const { ctx, request } = setup(t);
  for (let i = 0; i < 30; i++)
    await request('/telao/audiencia', {
      page: true,
      play: true,
      visitor: 'v' + i,
      screens: ['masp-principal'],
    });
  assert.equal(ctx.saves, 1);
  assert.equal(ctx.state.mediaAudience.pageViews, 1);
  await request('/telao/audiencia', { page: true }, '127.0.0.2');
  assert.equal(ctx.state.mediaAudience.pageViews, 2);
  assert.equal(ctx.saves, 1);
});
test('audiência usa IP validado do proxy e não compartilha throttle entre visitantes', async (t) => {
  const { ctx } = setup(t, { production: true, trustProxy: true });
  for (const realIp of ['192.0.2.1', '192.0.2.2']) {
    const res = {};
    await handleMedia(
      sessionRequest(ctx, {
        method: 'POST',
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-real-ip': realIp },
        data: Buffer.from('{"page":true}'),
      }),
      res,
      new URL('http://localhost/api/jogos/manifestacao/telao/audiencia'),
      ctx,
    );
    assert.equal(res.status, 200);
  }
  assert.equal(ctx.state.mediaAudience.pageViews, 2);
  assert.equal(ctx.saves, 1);
});
test('cota global configurada impede gravar upload antes de ultrapassar disco reservado', async (t) => {
  const { ctx, request } = setup(t, {
    production: true,
    mediaUploadUserIds: ['u1'],
    maxUploadsBytes: 100,
  });
  assert.equal((await request('/cartaz', png)).status, 200);
  assert.equal((await request('/telao/midia', png)).status, 507);
  assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 1);
});
test('destaques com pontos em produção têm cooldown e histórico expirado é podado', async (t) => {
  const { ctx, request } = setup(t);
  ctx.state.superchats = [{ userId: 'other', createdAt: 1, expiresAt: 1 }];
  const r = await request('/superchat', { message: 'Teste', cents: 100 });
  assert.equal(r.status, 200);
  assert.equal(r.payload.free, false);
  assert.equal(r.payload.currency, 'points');
  assert.equal(walletSummary(ctx.state, ctx.state.users[0]).balance, 200);
  assert.equal(ctx.state.superchats.length, 1);
  assert.equal((await request('/superchat', { message: 'Teste2', cents: 100 })).status, 429);
});
test('capacidade de anúncios ativos e impulsos recusados preservam saldo', async (t) => {
  const { ctx, request } = setup(t);
  ctx.state.mediaBids = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    userId: 'u1',
    expiresAt: Date.now() + 60000,
  }));
  ctx.state.media = [{ id: 'owned-media', userId: 'u1', status: 'approved', aspect: '16:9' }];
  assert.equal(
    (
      await request('/telao/lance', {
        items: [{ screen: 'masp-principal', cents: 100 }],
        media: ['owned-media'],
      })
    ).status,
    429,
  );
  assert.equal(ctx.state.mediaBids.length, 100);
  ctx.state.mediaBids = [];
  ctx.state.mediaPurchases = Object.fromEntries(
    Array.from({ length: 5 }, (_, i) => [String(i), { userId: 'u1', createdAt: Date.now() }]),
  );
  assert.equal((await request('/telao/lance', { boost: 'missing', cents: 100 })).status, 409);
  assert.equal(Object.keys(ctx.state.mediaPurchases).length, 5);
  assert.equal(walletSummary(ctx.state, ctx.state.users[0]).balance, 300);
  assert.equal(ctx.saves, 0);
});

test('uploads exigem conta completa e validação real antes de escrever', async (t) => {
  const { ctx, request } = setup(t);
  const user = ctx.state.users[0];
  user.verified = false;
  assert.equal((await request('/cartaz', png)).status, 403);
  user.verified = true;
  user.nickPending = true;
  assert.equal((await request('/cartaz', png)).status, 403);
  user.nickPending = false;
  assert.equal((await request('/cartaz', png.subarray(0, 30))).status, 400);
  assert.equal(fs.existsSync(path.join(ctx.dataDir, 'uploads')), false);
  const valid = await request('/cartaz?tipo=bandeira', png);
  assert.equal(valid.status, 200);
  assert.equal(valid.payload.design.mime, 'image/webp');
  assert.match(valid.payload.design.filename, /\.webp$/);
  assert.equal(user.mediaUploadTimes.length, 1);
});
test('limite persistido não reinicia em outro contexto e não consome pontos', async (t) => {
  const { ctx, request } = setup(t);
  ctx.state.users[0].mediaUploadTimes = Array(10).fill(Date.now());
  assert.equal((await request('/cartaz', png)).status, 429);
  assert.equal(fs.existsSync(path.join(ctx.dataDir, 'uploads')), false);
  ctx.state.users[0].mediaUploadTimes = Array(40).fill(Date.now() - 120000);
  assert.equal((await request('/telao/midia', png)).status, 429);
  assert.equal(walletSummary(ctx.state, ctx.state.users[0]).balance, 300);
});
test('ativação de bandeira em produção debita uma vez e exclusão limpa aparência', async (t) => {
  const { ctx, request } = setup(t);
  const user = ctx.state.users[0];
  user.appearance = {};
  const design = (await request('/cartaz?tipo=bandeira', png)).payload.design;
  for (let i = 0; i < 2; i++)
    assert.equal((await request('/cartaz/ativar', { id: design.id })).status, 200);
  assert.equal(walletSummary(ctx.state, user).balance, 200);
  assert.equal(user.appearance.design, design.id);
  assert.equal((await request('/cartaz/excluir', { id: design.id })).status, 200);
  assert.equal(user.design, undefined);
  assert.equal(user.appearance.design, undefined);
  assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 0);
});

test('uploads simultâneos respeitam o limite de designs e liberam reserva em falhas', async (t) => {
  const { ctx, request } = setup(t);
  ctx.state.designs = Array.from({ length: 19 }, (_, n) => ({
    id: `existing-${n}`,
    userId: 'u1',
    kind: 'cartaz',
    size: 0,
  }));
  let resume;
  const waiting = new Promise((resolve) => {
    resume = resolve;
  });
  const read = ctx.readBody;
  ctx.readBody = async (req) => {
    await waiting;
    return read(req);
  };
  const first = request('/cartaz', png);
  // Both requests reach the asynchronous body reader before either writes a file.
  await new Promise((resolve) => setImmediate(resolve));
  const second = await request('/cartaz', png);
  assert.equal(second.status, 409);
  resume();
  assert.equal((await first).status, 200);
  assert.equal(ctx.state.designs.length, 20);
  assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 1);

  ctx.state.designs.pop();
  ctx.readBody = read;
  assert.equal((await request('/cartaz', Buffer.from('invalid'))).status, 400);
  assert.equal((await request('/cartaz', png)).status, 200);
  assert.equal(ctx.state.designs.length, 20);
});

test('uploads limitam resolução por uso para reduzir memória gráfica em celulares', async (t) => {
  const { ctx, request } = setup(t);
  const large = await sharp({
    create: {
      width: 3000,
      height: 1500,
      channels: 3,
      background: 'blue',
    },
  })
    .png()
    .toBuffer();
  const design = (await request('/cartaz', large)).payload.design;
  const ad = (await request('/telao/midia', large)).payload;
  for (const [record, expectedWidth] of [
    [design, 2048],
    [ad, 1024],
  ]) {
    const metadata = await sharp(path.join(ctx.dataDir, 'uploads', record.filename)).metadata();
    assert.equal(metadata.width, expectedWidth);
    assert.equal(metadata.height, expectedWidth / 2);
  }
});
