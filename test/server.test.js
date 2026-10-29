import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createLocalServer } from '../src/server.js';
import { creditPoints } from '../src/points.js';

const prefix = '/api/jogos/manifestacao';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);

async function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-server-'));
  let app;
  let base;
  async function start() {
    app = await createLocalServer({ freeAccess: false, dataDir, port: 0 });
    const address = await app.listen();
    base = `http://127.0.0.1:${address.port}`;
  }
  await start();
  t.after(async () => {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return {
    get app() {
      return app;
    },
    get base() {
      return base;
    },
    dataDir,
    fetch(route, options) {
      return fetch(base + route, options);
    },
    async json(route, body, cookie) {
      const response = await fetch(base + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        data: await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    },
    async restart() {
      await app.close();
      await start();
    },
  };
}

function openSocket(url, cookie) {
  const ws = new WebSocket(url, {
    headers: { Cookie: cookie, Origin: url.replace(/^ws:/, 'http:').replace(/\/ws$/, '') },
  });
  const messages = [];
  ws.on('message', (data, binary) =>
    messages.push(binary ? Buffer.from(data) : JSON.parse(data.toString())),
  );
  const ready = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    ws,
    ready,
    async wait(predicate) {
      const deadline = Date.now() + 2500;
      while (Date.now() < deadline) {
        const match = messages.find(predicate);
        if (match) return match;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('WebSocket raiz não entregou a mensagem esperada');
    },
    async close() {
      if (ws.readyState === WebSocket.CLOSED) return;
      const closed = new Promise((resolve) => ws.once('close', resolve));
      ws.close();
      await closed;
    },
  };
}

test('HTTP raiz entrega HTML, MIME, assets com Range e CSP local', async (t) => {
  const f = await fixture(t);
  const page = await f.fetch('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  const csp = page.headers.get('content-security-policy');
  assert.ok(csp.includes("connect-src 'self'"));
  assert.ok(!/https?:\/\//.test(csp));
  assert.ok(!/ws:\/\/(?!localhost|127\.0\.0\.1)/.test(csp));
  const html = await page.text();
  assert.doesNotMatch(html, /id="local-mode-notice"/);
  const clientEntry = html.match(/src="(\/client\.js\?v=[a-f0-9]{12})"/);
  assert.ok(clientEntry, 'HTML referencia cliente com hash de conteúdo para invalidar cache');
  const htmlTags = html.match(/<[a-z][^>]*>/gi) ?? [];
  const canonicalTags = htmlTags.filter(
    (tag) => /^<link\b/i.test(tag) && /\brel=["']canonical["']/i.test(tag),
  );
  assert.equal(canonicalTags.length, 1, 'HTML declara uma URL canônica');
  assert.match(canonicalTags[0], /\bhref=["']https:\/\/manifestacoes\.com\/["']/);
  for (const tag of htmlTags) {
    for (const attribute of tag.matchAll(/\b(src|href)\s*=\s*["']([^"']*)["']/gi)) {
      if (attribute[1].toLowerCase() === 'href' && canonicalTags.includes(tag)) continue;
      assert.doesNotMatch(
        attribute[2],
        /^(?:https?:)?\/\//i,
        `Recurso deve permanecer local: ${tag}`,
      );
    }
  }
  const js = await f.fetch(clientEntry[1], { method: 'HEAD' });
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /^text\/javascript/);
  assert.ok(Number(js.headers.get('content-length')) > 100000);
  const css = await f.fetch('/assets/index-CyQa0fiC.css', { method: 'HEAD' });
  assert.match(css.headers.get('content-type'), /^text\/css/);
  const asset = await f.fetch('/assets/models/building.glb', { headers: { Range: 'bytes=0-15' } });
  assert.equal(asset.status, 206);
  assert.match(asset.headers.get('content-type'), /^model\/gltf-binary/);
  assert.match(asset.headers.get('content-range'), /^bytes 0-15\/\d+$/);
  const bytes = Buffer.from(await asset.arrayBuffer());
  assert.equal(bytes.length, 16);
  assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
  const suffix = await f.fetch('/assets/models/building.glb', { headers: { Range: 'bytes=-8' } });
  assert.equal(suffix.status, 206);
  assert.equal((await suffix.arrayBuffer()).byteLength, 8);
  const invalid = await f.fetch('/assets/models/building.glb', {
    headers: { Range: 'bytes=999999999-' },
  });
  assert.equal(invalid.status, 416);
  await invalid.arrayBuffer();
  const health = await f.json('/health');
  assert.equal(health.data.local, true);
  assert.equal((await f.json('/api/inexistente')).status, 404);
  const foreign = await f.fetch('/health', { headers: { Origin: 'https://outside.example.test' } });
  assert.equal(foreign.status, 403);
  await foreign.arrayBuffer();
});

test('cadastro, login, resgate com pontos, visual, upload e sessão sobrevivem ao restart real', async (t) => {
  const f = await fixture(t);
  const registration = {
    email: 'integracao@example.test',
    nick: 'Integração',
    password: 'senha-integracao-123',
  };
  assert.equal((await f.json(`${prefix}/conta`)).data.user, null);
  const created = await f.json('/api/auth/register', registration);
  assert.equal(created.status, 200);
  assert.match(created.data.localCode, /^\d{6}$/);
  const verified = await f.json('/api/auth/verify', {
    email: registration.email,
    code: created.data.localCode,
  });
  assert.equal(verified.status, 200);
  assert.match(verified.cookie, /^local_session=[a-f0-9]{64}$/);
  await f.json('/api/auth/logout', {}, verified.cookie);
  assert.equal((await f.json('/api/me', undefined, verified.cookie)).data.user, null);
  const login = await f.json('/api/auth/login', {
    email: registration.email,
    password: registration.password,
  });
  assert.equal(login.status, 200);
  const cookie = login.cookie;
  // Saldo extra exclusivo da fixture para testar dois resgates duráveis.
  creditPoints(f.app.ctx.state, f.app.ctx.state.users[0], {
    amount: 100,
    reason: 'test_fixture',
    reference: 'server-test-extra',
  });
  f.app.ctx.save();
  const account = await f.json(`${prefix}/conta`, undefined, cookie);
  assert.equal(account.data.user.nick, registration.nick);
  assert.equal(account.data.user.tinta.unlimited, true);
  const item = account.data.personagens[0];
  const purchase = await f.json(`${prefix}/personagem`, { key: item.key }, cookie);
  assert.equal(purchase.status, 200);
  assert.equal(purchase.data.status, 'paid');
  assert.equal(purchase.data.pointsCost, 300);
  assert.equal(purchase.data.currency, 'points');
  assert.equal(purchase.data.simulation, true);
  const visual = { team: 2, character: 4, shirt: 7, appearance: 123 };
  assert.deepEqual(
    (await f.json(`${prefix}/visual`, visual, cookie)).data.account.user.visual,
    visual,
  );
  const upload = await f.fetch(`${prefix}/cartaz?tipo=cartaz&texto=Integração`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'image/png' },
    body: png,
  });
  assert.equal(upload.status, 200);
  const design = (await upload.json()).design;
  assert.equal((await f.json(`${prefix}/cartaz/ativar`, { id: design.id }, cookie)).status, 200);
  await f.restart();
  const restored = await f.json(`${prefix}/conta`, undefined, cookie);
  assert.equal(restored.data.user.nick, registration.nick);
  assert.deepEqual(restored.data.user.visual, { ...visual, design: design.id });
  assert.ok(restored.data.user.cartazes.some((d) => d.id === design.id));
  const polled = await f.json(`${prefix}/personagem?ref=${purchase.data.ref}`, undefined, cookie);
  assert.equal(polled.data.status, 'paid');
  const image = await f.fetch(design.url);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /^image\/png/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  const persisted = JSON.parse(fs.readFileSync(path.join(f.dataDir, 'state.json'), 'utf8'));
  assert.ok(persisted.users[0].owned.skins.includes(item.key));
  assert.ok(!persisted.users[0].passwordHash.includes(registration.password));

  const socket = openSocket(f.base.replace(/^http:/, 'ws:') + '/ws', cookie);
  await socket.ready;
  try {
    socket.ws.send(
      JSON.stringify({ t: 'join', nick: 'Nick deve vir da conta', team: 2, character: 4 }),
    );
    const welcome = await socket.wait((m) => m.t === 'welcome');
    assert.equal(welcome.inputBinary, true);
    const names = await socket.wait(
      (m) => m.t === 'names' && m.people?.some((p) => p.id === welcome.id),
    );
    assert.equal(names.people.find((p) => p.id === welcome.id).nick, registration.nick);
    const snapshot = await socket.wait((m) => Buffer.isBuffer(m) && m[0] === 1);
    assert.equal(snapshot.readUInt32LE(7), welcome.id);
    const stats = await f.json('/servidores');
    assert.equal(stats.data.total, 1);
    assert.equal(stats.data.servers[0].ws, f.base.replace(/^http:/, 'ws:') + '/ws');
  } finally {
    await socket.close();
  }
});

test('páginas institucionais incluem viewport e margens legíveis em telas pequenas', async (t) => {
  const f = await fixture(t);
  for (const route of ['/sobre', '/privacidade', '/termos']) {
    const response = await f.fetch(route);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(html, /padding:0 20px/);
    assert.match(html, /Voltar ao jogo/);
  }
});
