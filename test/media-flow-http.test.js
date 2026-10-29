import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { WebSocket } from 'ws';
import { createLocalServer } from '../src/server.js';

test('HTTP e WebSocket: design e campanha por pontos atualizam cena, cancelam e persistem', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-media-flow-'));
  let app, origin;
  async function start() {
    app = await createLocalServer({
      freeAccess: false,
      dataDir,
      port: 0,
      emailCodeSecret: 'http-media-test'.repeat(3),
    });
    const a = await app.listen();
    origin = `http://127.0.0.1:${a.port}`;
  }
  await start();
  t.after(async () => {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  let cookie;
  async function json(route, body) {
    const r = await fetch(origin + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const email = 'media-flow@example.test';
  const code = (await json('/api/auth/email/request', { email })).body.localCode;
  const login = await json('/api/auth/email/verify', { email, code });
  cookie = login.cookie;
  await json('/api/profile/nick', { nick: 'MidiaTeste' });
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#006b61' } })
    .png()
    .toBuffer();
  async function upload(route) {
    const r = await fetch(origin + route, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'image/png' },
      body: png,
    });
    assert.equal(r.status, 200);
    return r.json();
  }
  const design = (await upload('/api/jogos/manifestacao/cartaz?tipo=cartaz')).design;
  assert.equal(design.paid, false);
  const activated = await json('/api/jogos/manifestacao/cartaz/ativar', { id: design.id });
  assert.equal(activated.status, 200);
  const account = (await json('/api/jogos/manifestacao/conta')).body;
  assert.equal(account.wallet.balance, 200);
  const screens = (await json('/api/jogos/manifestacao/teloes/painel')).body;
  const screen = screens.screens[0];
  const media = await upload(
    '/api/jogos/manifestacao/telao/midia?aspect=' + encodeURIComponent(screen.aspect),
  );
  const socket = new WebSocket(origin.replace('http:', 'ws:') + '/ws', {
    headers: { Cookie: cookie, Origin: origin },
  });
  const messages = [];
  socket.on('message', (b, binary) => {
    if (!binary) messages.push(JSON.parse(b.toString()));
  });
  socket.on('error', () => {});
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  t.after(() => socket.terminate());
  socket.send(JSON.stringify({ t: 'join', nick: 'MidiaTeste', team: 0, character: 0 }));
  async function wait(predicate) {
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      const item = messages.find(predicate);
      if (item) return item;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error('Evento de cena não recebido');
  }
  await wait((m) => m.t === 'welcome');
  const order = {
    items: [{ screen: screen.id, cents: 100 }],
    media: [media.id],
    requestId: 'media-flow-order',
  };
  const bought = await json('/api/jogos/manifestacao/telao/lance', order);
  assert.equal(bought.status, 200);
  const broadcast = await wait(
    (m) => m.t === 'screens' && m.items?.some((s) => s.id === screen.id),
  );
  assert.ok(broadcast.screens.find((s) => s.id === screen.id).current.playlist.length);
  assert.equal((await json('/api/jogos/manifestacao/pontos')).body.balance, 100);
  const before = messages.length;
  const cancelled = await json('/api/jogos/manifestacao/telao/cancelar', { ref: bought.body.ref });
  assert.equal(cancelled.status, 200);
  await wait(
    (m) =>
      messages.indexOf(m) >= before &&
      m.t === 'screens' &&
      !m.items.some((s) => s.id === screen.id),
  );
  const balance = (await json('/api/jogos/manifestacao/pontos')).body.balance;
  assert.ok(balance >= 199 && balance <= 200);
  await json('/api/jogos/manifestacao/telao/cancelar', { ref: bought.body.ref });
  assert.equal((await json('/api/jogos/manifestacao/pontos')).body.balance, balance);
  const deleted = await fetch(origin + '/api/jogos/manifestacao/telao/midia?id=' + media.id, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).status, 'deleted');
  assert.equal((await fetch(origin + media.url)).status, 404);
  socket.terminate();
  await app.close();
  await start();
  assert.equal((await json('/api/jogos/manifestacao/pontos')).body.balance, balance);
  assert.equal((await json('/api/jogos/manifestacao/conta')).body.user.cartazes[0].paid, true);
  assert.equal((await json('/api/jogos/manifestacao/teloes/painel')).body.items.length, 0);
  assert.equal((await json('/api/jogos/manifestacao/teloes/painel')).body.mine.media.length, 0);
  assert.equal(
    (await json('/api/jogos/manifestacao/telao/lance?ref=' + bought.body.ref)).status,
    200,
  );
});
