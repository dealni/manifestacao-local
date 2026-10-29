import { sessionRequest } from './session-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createServer } from 'node:http';
import { handleMedia, getScreens, getSuperchats } from '../src/media.js';
import { buildAccount } from '../src/economy.js';
import { initializeWallet, creditPoints, walletSummary } from '../src/points.js';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
function setup(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-media-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const user = { id: 'u1', nick: 'Local', verified: true, nickPending: false };
  const events = [];
  const ctx = {
    dataDir,
    state: {},
    user: () => user,
    account: () => ({ user }),
    save() {},
    broadcast: (x) => events.push(x),
    send(res, status, payload) {
      res.status = status;
      res.payload = payload;
      res.end?.();
    },
    readBody: async (req) => req.data,
    body: async (req) => JSON.parse(req.data.toString()),
  };
  ctx.state.users = [user];
  initializeWallet(ctx.state, user);
  async function request(route, method = 'GET', data) {
    const req = {
      method,
      headers: {},
      data: Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data ?? {})),
    };
    const res = {};
    const handled = await handleMedia(
      sessionRequest(ctx, req),
      res,
      new URL('http://localhost/api/jogos/manifestacao' + route),
      ctx,
    );
    return { ...res, handled };
  }
  return { ctx, user, events, request };
}
test('cria, ativa e exclui cartaz da conta com identificador aceito pelo renderer', async (t) => {
  const { ctx, user, request } = setup(t);
  const r = await request('/cartaz?tipo=cartaz&texto=Local', 'POST', png);
  assert.equal(r.status, 200);
  const d = r.payload.design;
  assert.match(d.id, /^c[0-9a-f]{15}$/);
  assert.equal(d.status, 'approved');
  assert.equal(d.paid, false);
  assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 1);
  assert.equal((await request('/cartaz/ativar', 'POST', { id: d.id })).status, 200);
  assert.equal(user.design, d.id);
  assert.equal((await request('/cartaz/excluir', 'POST', { id: d.id })).status, 200);
  assert.equal(ctx.state.designs.length, 0);
  assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 0);
});
test('rejeita conteúdo arbitrário e acesso de outra conta', async (t) => {
  const { ctx, request } = setup(t);
  assert.equal(
    (await request('/cartaz?tipo=cartaz', 'POST', Buffer.from('<script>bad</script>'))).status,
    400,
  );
  const r = await request('/cartaz?tipo=bandeira', 'POST', png);
  ctx.user = () => ({ id: 'u2' });
  assert.equal((await request('/cartaz/ativar', 'POST', { id: r.payload.design.id })).status, 404);
  assert.equal((await request('/cartaz/excluir', 'POST', { id: '../../test' })).status, 404);
});
test('upload permite comprar campanha fixa uma vez e pedido inválido não debita', async (t) => {
  const { ctx, user, events, request } = setup(t);
  const media = await request('/telao/midia?aspect=16:9', 'POST', png);
  assert.equal(media.payload.status, 'approved');
  const body = {
    items: [{ screen: 'masp-principal', cents: 100 }],
    media: [media.payload.id],
  };
  const purchased = await request('/telao/lance', 'POST', body);
  assert.equal(purchased.status, 200);
  assert.equal(purchased.payload.points, 100);
  assert.equal(purchased.payload.paid, true);
  const retry = await request('/telao/lance', 'POST', body);
  assert.equal(retry.payload.ref, purchased.payload.ref);
  const invalid = await request('/telao/lance', 'POST', {
    ...body,
    items: [{ screen: 'inexistente', cents: 100 }],
  });
  assert.equal(invalid.status, 400);
  assert.equal(walletSummary(ctx.state, user).balance, 200);
  assert.equal(ctx.state.mediaBids.length, 1);
  assert.equal(Object.keys(ctx.state.mediaPurchases).length, 1);
  assert.equal(events.filter((event) => event.t === 'screens').length, 2);
});
test('superchat publica lista e destaque sem rede ou áudio remoto', async (t) => {
  const { ctx, events, request } = setup(t);
  const r = await request('/superchat', 'POST', {
    message: 'Teste local',
    cents: 100,
    voice: 'external',
  });
  assert.equal(r.status, 200);
  assert.equal(r.payload.audio, null);
  assert.equal(getSuperchats(ctx).items.length, 1);
  assert.deepEqual(
    events.map((e) => e.t),
    ['sc_list', 'sc_air'],
  );
  assert.equal((await request('/superchat?ref=' + r.payload.ref)).payload.message, 'Teste local');
});
test('não consome rotas alheias e exige conta nas gravações', async (t) => {
  const { ctx, request } = setup(t);
  assert.equal((await request('/conta')).handled, false);
  ctx.user = () => null;
  assert.equal((await request('/cartaz?tipo=cartaz', 'POST', png)).status, 401);
  assert.equal((await request('/teloes/painel')).status, 200);
});
test('recupera todas as 65 telas e geometria procedural do cliente', (t) => {
  const { ctx } = setup(t);
  const screens = getScreens(ctx).screens;
  assert.equal(screens.length, 65);
  assert.equal(new Set(screens.map((s) => s.id)).size, 65);
  assert.deepEqual([...new Set(screens.map((s) => s.mount))].sort(), [
    'facade',
    'kiosk',
    'masp',
    'park',
    'shelter',
  ]);
  assert.ok(
    screens.every((s) => Number.isFinite(s.x) && Number.isFinite(s.z) && s.w > 0 && s.h > 0),
  );
});
test('serve textura binária e HTTP Range no endereço usado pelo renderer', async (t) => {
  const { ctx, request } = setup(t);
  const upload = await request('/cartaz?tipo=cartaz', 'POST', png);
  const server = createServer(async (req, res) => {
    await handleMedia(sessionRequest(ctx, req), res, new URL(req.url, 'http://localhost'), ctx);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}${upload.payload.design.url}`;
  const full = await fetch(url);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), png);
  const range = await fetch(url, { headers: { range: 'bytes=0-7' } });
  assert.equal(range.status, 206);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), png.subarray(0, 8));
  assert.equal((await fetch(url, { headers: { range: 'bytes=999999-' } })).status, 416);
});
function existingBid(ctx, media, amount = 100) {
  const bid = {
    id: `existing-${ctx.state.mediaBids.length}`,
    userId: 'u1',
    screen: 'masp-principal',
    cents: amount,
    media: media.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };
  ctx.state.mediaBids.push(bid);
  return bid;
}
test('lances existentes mantêm fila, ranking e expiração; impulsos novos ficam bloqueados', async (t) => {
  const { ctx, user, request } = setup(t);
  const uploaded = (await request('/telao/midia', 'POST', png)).payload;
  for (let i = 0; i < 6; i++) existingBid(ctx, uploaded, 100 + i * 100);
  const panel = (await request('/teloes/painel')).payload;
  const screen = panel.screens.find((s) => s.id === 'masp-principal');
  assert.equal(screen.queued, 1);
  assert.equal(screen.queue[0].queuePosition, 1);
  assert.equal(screen.min, 100);
  assert.equal(screen.ranking[0].amount, 600);
  assert.equal(
    (
      await request('/telao/lance', 'POST', {
        boost: ctx.state.mediaBids[0].id,
        cents: 1000,
      })
    ).status,
    409,
  );
  assert.equal(ctx.state.mediaBids[0].cents, 100);
  assert.equal(walletSummary(ctx.state, user).balance, 300);
  ctx.state.mediaBids.forEach((b) => (b.expiresAt = Date.now() - 1));
  assert.equal(getScreens(ctx).items.length, 0);
  assert.equal(ctx.state.mediaBids[0].status, 'expired');
});

// Execute recovered client functions themselves: these tests fail on response
// schemas that look valid in endpoint tests but cannot reach or render the UI.
const originalClient = fs.readFileSync(
  new URL('../analysis/client-readable.js', import.meta.url),
  'utf8',
);
function clientFunction(name, endMarker) {
  const start = originalClient.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  const end = originalClient.indexOf(endMarker, start);
  assert.ok(end > start);
  return originalClient.slice(start, end);
}
test('painel autenticado atravessa os guards reais de upload e visitante não', async (t) => {
  const { ctx, request } = setup(t);
  const run = async (panel) => {
    const sandbox = vm.createContext({
      Zi() {},
      ah() {},
      he: { selected: new Set(['masp-principal']) },
      cn: true,
      qi: panel,
      gn: () => true,
      $6: () => [],
      No: () => 'eligible',
      T: () => ({}),
      St: () => ({}),
      la: () => 'login',
      nl: '/login',
    });
    vm.runInContext('async ' + clientFunction('Va', 'function kj('), sandbox);
    return vm.runInContext('Va()', sandbox);
  };
  assert.equal(await run((await request('/teloes/painel')).payload), 'eligible');
  ctx.user = () => null;
  const anonymous = (await request('/teloes/painel')).payload;
  assert.equal(anonymous.signedIn, false);
  assert.equal(await run(anonymous), 'login');
});
test('renderer original conserva id da tela ao mesclar e tocar a playlist', async (t) => {
  const { ctx, request } = setup(t);
  const media = (await request('/telao/midia', 'POST', png)).payload;
  const bid = existingBid(ctx, media);
  const screens = getScreens(ctx);
  const played = [];
  const sandbox = vm.createContext({
    bs: screens,
    v4: () => Date.now(),
    tw: new Map(),
    ao: screens.screens,
    no: (url) => url,
    Wi: {
      setCycle() {},
      setPrices() {},
      clear() {},
      setPlaylist: (...args) => played.push(args),
    },
  });
  vm.runInContext(clientFunction('nw', 'const he ='), sandbox);
  vm.runInContext('nw()', sandbox);
  assert.equal(played.length, 1);
  assert.equal(played[0][0], 'masp-principal');
  assert.equal(played[0][1][0].url, media.url);
  assert.equal(screens.items[0].playlist[0].bidId, bid.id);
  assert.equal(screens.items[0].playlist[0].mediaId, media.id);
});
test('upload e reutilização atendem cópias de ambos formatos do consumidor original', async (t) => {
  const { request } = setup(t);
  const media = (await request('/telao/midia?aspect=16:9,9:16', 'POST', png)).payload;
  assert.deepEqual(Object.keys(media.copies), ['16:9', '9:16']);
  const panel = (await request('/teloes/painel')).payload;
  const sandbox = vm.createContext({});
  vm.runInContext(clientFunction('Cj', 'function Fu('), sandbox);
  sandbox.panel = panel;
  const reused = vm.runInContext('Cj(panel, ["16:9", "9:16"])', sandbox);
  assert.equal(reused.length, 1);
  for (const aspect of ['16:9', '9:16']) {
    assert.equal(reused[0].copies[aspect], media.copies[aspect]);
    const record = (await request('/telao/midia?id=' + media.copies[aspect])).payload;
    assert.equal(record.aspect, aspect);
  }
  const selected = [
    panel.screens.find((s) => s.aspect === '16:9'),
    panel.screens.find((s) => s.aspect === '9:16'),
  ];
  const result = await request('/telao/lance', 'POST', {
    items: selected.map((s) => ({ screen: s.id, cents: s.min })),
    media: Object.values(media.copies),
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.bids.length, 2);
  assert.equal(result.payload.total, 200);
  assert.equal(new Set(result.payload.bids.map((bid) => bid.media)).size, 2);
  assert.equal((await request('/telao/midia?aspect=evil', 'POST', png)).status, 400);
});
test('intervalo de superchat divulgado pela conta é aceito e limites são recusados', async (t) => {
  const { ctx, user, request } = setup(t);
  const config = buildAccount(ctx, user).superchat;
  creditPoints(ctx.state, user, {
    amount: 1000000,
    reason: 'fixture',
    reference: 'superchat-range',
  });
  const initialBalance = walletSummary(ctx.state, user).balance;
  const valid = [config.min, config.max, ...config.suggested];
  for (const cents of valid) {
    assert.equal((await request('/superchat', 'POST', { message: 'Local', cents })).status, 200);
  }
  assert.equal(
    walletSummary(ctx.state, user).balance,
    initialBalance - valid.reduce((sum, amount) => sum + amount, 0),
  );
  for (const cents of [config.min - 1, config.max + 1]) {
    assert.equal((await request('/superchat', 'POST', { message: 'Local', cents })).status, 400);
  }
});

class MediaElement {
  constructor(tag, className = '', text = '') {
    this.tag = tag;
    this.className = className;
    this.textContent = text;
    this.children = [];
    this.dataset = {};
    this.classList = {
      toggle() {},
      add() {},
      remove() {},
    };
  }
  append(...children) {
    this.children.push(...children);
  }
  setAttribute(key, value) {
    this[key] = value;
    if (key === 'class') this.className = value;
    if (key.startsWith('data-')) this.dataset[key.slice(5)] = value;
  }
  removeAttribute(key) {
    delete this[key];
  }
  addEventListener() {}
  querySelectorAll(selector) {
    return this.children
      .filter((child) => child instanceof MediaElement)
      .flatMap((child) => [
        ...((
          selector.startsWith('.')
            ? child.className.split(' ').includes(selector.slice(1))
            : child.tag === selector
        )
          ? [child]
          : []),
        ...child.querySelectorAll(selector),
      ]);
  }
}
function recoveredDeclaration(name) {
  const start = originalClient.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  return originalClient.slice(start, originalClient.indexOf('\n}', start) + 2);
}
function renderRecoveredScreenList(panel) {
  let rendered;
  const element = (tag, cls, text) => new MediaElement(tag, cls, text);
  const sandbox = vm.createContext({
    qi: panel,
    bs: { screens: [] },
    Hc: 'masp-principal',
    he: { selected: new Set() },
    Zi() {},
    T: element,
    St: (cls, text, action) => Object.assign(element('button', cls, text), { onclick: action }),
    Re: (value) => String(value),
    no: (url) => url,
    la: (...nodes) => {
      rendered = nodes;
    },
    OS: { large: 'Grande', medium: 'Médio', small: 'Pequeno' },
    US: { '16:9': 'Horizontal', '9:16': 'Vertical' },
    Mj: ['Telões', 'Arquivo', 'Valor', 'Pix'],
    $o: 'Fila local',
    Ur: 'Proteção local',
    C1: 'Modo local',
    ao: panel.screens,
    so: [],
    sk: [],
    ht: { minZ: -1000, maxZ: 1000 },
    _t: 10,
    Ut: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
    tt: { x: 0, z: 0, w: 10, d: 10 },
    document: { createElementNS: (_, tag) => element(tag) },
  });
  const pureHelpers = originalClient.slice(
    originalClient.indexOf('const G1 ='),
    originalClient.indexOf('function wj('),
  );
  const svgHelpers = originalClient.slice(
    originalClient.indexOf('const bj ='),
    originalClient.indexOf('function HS('),
  );
  vm.runInContext(
    [
      pureHelpers,
      svgHelpers,
      ...['Gr', 'HS', 'wj', 'xj', 'yj', 'No', 'VS', 'YS'].map(recoveredDeclaration),
    ].join('\n'),
    sandbox,
  );
  vm.runInContext('No()', sandbox);
  return rendered;
}
test('painel atravessa No, mapa e métricas originais completos, com audiência por cada tela', async (t) => {
  const { ctx, request } = setup(t);
  const initial = (await request('/teloes/painel')).payload;
  assert.equal(initial.audience.screens.length, initial.screens.length);
  assert.ok(initial.audience.screens.every((s) => s.views === 0 && s.viewers === 0));
  let rendered = renderRecoveredScreenList(initial);
  assert.equal(rendered[1].querySelectorAll('.telao-card').length, 65);
  assert.equal(rendered[1].querySelectorAll('.telao-dot').length, 65);
  const media = (await request('/telao/midia', 'POST', png)).payload;
  existingBid(ctx, media);
  await request('/telao/audiencia', 'POST', {
    visitor: 'visitor1',
    page: true,
    play: true,
    screens: ['masp-principal', 'masp-principal', 'inexistente'],
  });
  await request('/telao/audiencia', 'POST', {
    visitor: 'visitor1',
    screens: ['masp-principal'],
  });
  await request('/telao/audiencia', 'POST', {
    visitor: 'visitor2',
    play: true,
    screens: ['masp-principal'],
  });
  const panel = (await request('/teloes/painel')).payload;
  const masp = panel.audience.screens.find((s) => s.id === 'masp-principal');
  assert.deepEqual(masp, { id: 'masp-principal', views: 3, viewers: 2 });
  assert.equal(panel.audience.views24h, 3);
  assert.equal(panel.audience.views, 3);
  assert.equal(panel.audience.pageViews, 1);
  assert.equal(panel.audience.players24h, 2);
  rendered = renderRecoveredScreenList(panel);
  const metrics = rendered[1].querySelectorAll('.telao-screen-audience');
  assert.equal(metrics.length, 65);
  assert.match(metrics[0].textContent, /3 exibições · 2 visitantes/);
  assert.equal(rendered[1].querySelectorAll('.telao-owned-ad').length, 1);
  const stats = ctx.state.mediaAudience.screens['masp-principal'];
  stats.views = [Date.now() - 86400001];
  stats.visitors = { old: Date.now() - 86400001 };
  const expired = (await request('/teloes/painel')).payload;
  assert.equal(expired.audience.views24h, 0);
  assert.equal(expired.audience.views, 3);
  assert.equal(expired.audience.screens[0].viewers, 0);
  renderRecoveredScreenList(expired);
});

test('seis campanhas fixas aparecem juntas e cancelar remove somente a própria campanha', async (t) => {
  const { ctx, user, request } = setup(t);
  creditPoints(ctx.state, user, {
    amount: 1000,
    reason: 'fixture',
    reference: 'fixed-six',
  });
  const media = (await request('/telao/midia', 'POST', png)).payload;
  const purchases = [];
  for (let index = 0; index < 6; index++) {
    const copy = { ...media, id: `copy-${index}` };
    ctx.state.media.push(copy);
    const result = await request('/telao/lance', 'POST', {
      items: [{ screen: 'masp-principal', cents: 100 }],
      media: [copy.id],
    });
    assert.equal(result.status, 200);
    purchases.push(result.payload);
  }
  const screen = getScreens(ctx).screens.find((entry) => entry.id === 'masp-principal');
  assert.equal(screen.ranking.length, 6);
  assert.equal(screen.current.playlist.length, 6);
  assert.equal(screen.queued, 0);
  assert.ok(screen.ranking.every((entry) => entry.status === 'live'));
  assert.equal(walletSummary(ctx.state, user).balance, 700);
  ctx.user = () => ({ id: 'other', verified: true, nickPending: false });
  assert.equal((await request('/telao/cancelar', 'POST', { ref: purchases[0].ref })).status, 404);
  assert.equal(
    (
      await request('/telao/lance', 'POST', {
        items: [{ screen: 'masp-principal', cents: 100 }],
        media: [media.id],
      })
    ).status,
    400,
  );
  assert.equal((await request(`/telao/lance?ref=${purchases[0].ref}`)).status, 404);
  ctx.user = () => user;
  const cancel = await request('/telao/cancelar', 'POST', {
    ref: purchases[0].ref,
  });
  assert.equal(cancel.status, 200);
  assert.ok(cancel.payload.refundPoints >= 99 && cancel.payload.refundPoints <= 100);
  const balance = walletSummary(ctx.state, user).balance;
  assert.equal(balance, 700 + cancel.payload.refundPoints);
  assert.equal(
    (await request('/telao/cancelar', 'POST', { ref: purchases[0].ref })).payload.refundPoints,
    0,
  );
  const after = getScreens(ctx).screens.find((entry) => entry.id === 'masp-principal');
  assert.equal(after.current.playlist.length, 5);
  assert.ok(after.current.playlist.every((entry) => entry.ref !== purchases[0].ref));
  assert.equal(ctx.state.mediaBids[0].status, 'cancelled');
});

test('consultas de telões podam programação antiga e preservam recibos e retries', async (t) => {
  const { ctx, request } = setup(t);
  const media = (await request('/telao/midia', 'POST', png)).payload;
  const order = {
    items: [{ screen: 'masp-principal', cents: 100 }],
    media: [media.id],
    requestId: 'retained-receipt',
  };
  const purchase = (await request('/telao/lance', 'POST', order)).payload;
  const old = { ...purchase.bids[0], id: 'old', expiresAt: Date.now() - 8 * 86400000 };
  ctx.state.mediaBids.push(old);
  ctx.state.superchats.push({ expiresAt: Date.now() - 8 * 86400000 });
  let saves = 0;
  ctx.save = () => saves++;
  const panel = await request('/teloes/painel');
  assert.equal(panel.status, 200);
  assert.deepEqual(
    ctx.state.mediaBids.map((bid) => bid.id),
    [purchase.bids[0].id],
  );
  assert.equal(ctx.state.superchats.length, 0);
  assert.equal(saves, 1);
  await request('/teloes/painel');
  assert.equal(saves, 1);
  assert.equal((await request('/telao/lance', 'POST', order)).payload.ref, purchase.ref);
  assert.equal((await request('/telao/lance?ref=' + purchase.ref)).payload.ref, purchase.ref);
});

test('exclusão de mídia libera arquivo e variantes sem excluir recibos ou permitir apagar anúncio ativo', async (t) => {
  const { ctx, user, request } = setup(t);
  const media = (await request('/telao/midia?aspect=16:9,9:16', 'POST', png)).payload;
  const purchase = (
    await request('/telao/lance', 'POST', {
      items: [{ screen: 'masp-principal', cents: 100 }],
      media: [media.id],
    })
  ).payload;
  const route = '/telao/midia?id=' + media.id;
  assert.equal((await request(route, 'DELETE')).status, 409);
  ctx.user = () => ({ id: 'other' });
  assert.equal((await request(route, 'DELETE')).status, 404);
  ctx.user = () => user;
  await request('/telao/cancelar', 'POST', { ref: purchase.ref });
  const deleted = await request(route, 'DELETE');
  assert.equal(deleted.status, 200);
  assert.deepEqual(new Set(deleted.payload.ids), new Set(Object.values(media.copies)));
  assert.equal(ctx.state.media.length, 0);
  assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 0);
  assert.equal((await request('/telao/lance?ref=' + purchase.ref)).status, 200);
  assert.equal((await request(route, 'DELETE')).status, 404);
});

test('exclusão respeita sessão revogada e referências de arquivos compartilhados', async (t) => {
  const { ctx, request } = setup(t);
  const media = (await request('/telao/midia', 'POST', png)).payload;
  const copy = { ...media, id: 'shared-copy', group: 'separate', userId: 'other' };
  ctx.state.media.push(copy);
  const req = sessionRequest(ctx, { method: 'DELETE', headers: {} });
  ctx.state.sessions = {};
  const res = {};
  await handleMedia(req, res, new URL('http://localhost/telao/midia?id=' + media.id), ctx);
  assert.equal(res.status, 401);
  assert.equal(ctx.state.media.length, 2);
  assert.equal((await request('/telao/midia?id=' + media.id, 'DELETE')).status, 200);
  assert.deepEqual(ctx.state.media, [copy]);
  assert.equal(fs.readdirSync(path.join(ctx.dataDir, 'uploads')).length, 1);
});

test('exclusão só apaga bytes depois de salvar e confirmar persistência', async (t) => {
  const { ctx, request } = setup(t);
  const media = (await request('/telao/midia', 'POST', png)).payload;
  const file = path.join(ctx.dataDir, 'uploads', media.filename);
  let release;
  const confirmed = new Promise((resolve) => {
    release = resolve;
  });
  ctx.persistence = { flush: () => confirmed };
  const deleting = request('/telao/midia?id=' + media.id, 'DELETE');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ctx.state.media.length, 0);
  assert.equal(fs.existsSync(file), true);
  release();
  assert.equal((await deleting).status, 200);
  assert.equal(fs.existsSync(file), false);
});

test('falhas em save ou flush preservam arquivo e restauram mídia sem perder inclusão concorrente', async (t) => {
  for (const stage of ['save', 'flush']) {
    const { ctx, request } = setup(t);
    const media = (await request('/telao/midia', 'POST', png)).payload;
    const file = path.join(ctx.dataDir, 'uploads', media.filename);
    const concurrent = { id: 'concurrent' };
    const failure = () => {
      ctx.state.media.push(concurrent);
      throw new Error('falha de persistência');
    };
    if (stage === 'save') ctx.save = failure;
    else ctx.persistence = { flush: failure };
    const result = await request('/telao/midia?id=' + media.id, 'DELETE');
    assert.equal(result.status, 500);
    assert.equal(fs.existsSync(file), true);
    assert.ok(ctx.state.media.includes(media));
    assert.ok(ctx.state.media.includes(concurrent));
  }
});

test('falha de remoção mantém exclusão durável e não expõe caminho do arquivo', async (t) => {
  const { ctx, request } = setup(t);
  const media = (await request('/telao/midia', 'POST', png)).payload;
  const file = path.join(ctx.dataDir, 'uploads', media.filename);
  fs.rmSync(file);
  fs.mkdirSync(file);
  let flushed = false;
  ctx.persistence = {
    flush: async () => {
      flushed = true;
    },
  };
  const result = await request('/telao/midia?id=' + media.id, 'DELETE');
  assert.equal(flushed, true);
  assert.equal(result.status, 200);
  assert.equal(result.payload.cleanupPending, true);
  assert.equal(ctx.state.media.length, 0);
  assert.ok(!JSON.stringify(result.payload).includes(ctx.dataDir));
  assert.equal(fs.existsSync(file), true);
});

test('cartaz excluído mantém bytes se gravação falhar e aguarda confirmação para limpar', async (t) => {
  for (const failure of ['save', 'flush', null]) {
    const { ctx, user, request } = setup(t);
    const design = (await request('/cartaz', 'POST', png)).payload.design;
    await request('/cartaz/ativar', 'POST', { id: design.id });
    const file = path.join(ctx.dataDir, 'uploads', design.filename);
    if (failure === 'save')
      ctx.save = () => {
        throw Error('save');
      };
    if (failure === 'flush')
      ctx.persistence = {
        flush: async () => {
          throw Error('flush');
        },
      };
    const result = await request('/cartaz/excluir', 'POST', { id: design.id });
    assert.equal(result.status, failure ? 500 : 200);
    assert.equal(fs.existsSync(file), !!failure);
    if (!failure) assert.equal(user.design, undefined);
  }
});

test('compra durante exclusão pendente não debita e referência concorrente preserva bytes', async (t) => {
  const { ctx, user, request } = setup(t);
  const media = (await request('/telao/midia', 'POST', png)).payload;
  let release;
  ctx.persistence = {
    flush: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  };
  const deleting = request('/telao/midia?id=' + media.id, 'DELETE');
  await new Promise((resolve) => setImmediate(resolve));
  const balance = walletSummary(ctx.state, user).balance;
  assert.equal(
    (
      await request('/telao/lance', 'POST', {
        items: [{ screen: 'masp-principal', cents: 100 }],
        media: [media.id],
      })
    ).status,
    400,
  );
  assert.equal(walletSummary(ctx.state, user).balance, balance);
  ctx.state.media.push({ ...media, id: 'concurrent-copy' });
  release();
  assert.equal((await deleting).status, 200);
  assert.equal(fs.existsSync(path.join(ctx.dataDir, 'uploads', media.filename)), true);
});

test('exclusões concorrentes de arquivo compartilhado aguardam ambas confirmações', async (t) => {
  const { ctx, request } = setup(t);
  const media = (await request('/telao/midia', 'POST', png)).payload;
  const copy = { ...media, id: 'copy', group: 'separate' };
  ctx.state.media.push(copy);
  const pending = [];
  ctx.persistence = {
    flush: () =>
      new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
  };
  const first = request('/telao/midia?id=' + media.id, 'DELETE');
  const second = request('/telao/midia?id=copy', 'DELETE');
  await new Promise((resolve) => setImmediate(resolve));
  pending[0].resolve();
  assert.equal((await first).status, 200);
  assert.equal(fs.existsSync(path.join(ctx.dataDir, 'uploads', media.filename)), true);
  pending[1].reject(Error('flush'));
  assert.equal((await second).status, 500);
  assert.ok(ctx.state.media.includes(copy));
  assert.equal(fs.existsSync(path.join(ctx.dataDir, 'uploads', media.filename)), true);
});

test('rollback restaura referência antes de outra exclusão retomar no mesmo turno de microtasks', async (t) => {
  const { ctx, request } = setup(t);
  const media = (await request('/telao/midia', 'POST', png)).payload;
  const copy = { ...media, id: 'copy', group: 'separate' };
  ctx.state.media.push(copy);
  const pending = [];
  ctx.persistence = {
    flush: () =>
      new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
  };
  const first = request('/telao/midia?id=' + media.id, 'DELETE');
  const second = request('/telao/midia?id=copy', 'DELETE');
  await new Promise((resolve) => setImmediate(resolve));
  pending[1].reject(Error('flush'));
  pending[0].resolve();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 500);
  assert.ok(ctx.state.media.includes(copy));
  assert.equal(fs.existsSync(path.join(ctx.dataDir, 'uploads', media.filename)), true);
});

test('ativação após serialização mantém design no visual retornado pela conta', async (t) => {
  const { ctx, user, request } = setup(t);
  Object.assign(
    user,
    JSON.parse(
      JSON.stringify({
        visual: { character: 0, appearance: 0 },
        appearance: { character: 0, appearance: 0 },
      }),
    ),
  );
  ctx.account = () => buildAccount(ctx, user);
  const design = (await request('/cartaz?tipo=bandeira', 'POST', png)).payload.design;
  const activated = await request('/cartaz/ativar', 'POST', { id: design.id });
  assert.equal(activated.status, 200);
  assert.equal(user.visual.design, design.id);
  assert.equal(user.appearance.design, design.id);
  assert.equal(activated.payload.account.user.visual.design, design.id);
  const restoredState = JSON.parse(JSON.stringify(ctx.state));
  assert.equal(
    buildAccount({ ...ctx, state: restoredState }, restoredState.users[0]).user.visual.design,
    design.id,
  );
});
