import { requireServedArtifact } from './helpers/served-artifact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import babel from 'prettier/plugins/babel';
import {
  applyPointsClient,
  pointsRuntime,
  simpleAdsRuntime,
  designPricingRuntime,
} from '../scripts/points-client.js';

function runtime(search = '', stored = null, storageDenied = false) {
  const records = new Map(stored ? [['brasilia-referral', stored]] : []);
  const ctx = vm.createContext({
    URLSearchParams,
    URL,
    Number,
    location: { search, origin: 'https://manifestacoes.com' },
    sessionStorage: {
      getItem(k) {
        if (storageDenied) throw Error('denied');
        return records.get(k);
      },
      setItem(k, v) {
        if (storageDenied) throw Error('denied');
        records.set(k, v);
      },
      removeItem(k) {
        if (storageDenied) throw Error('denied');
        records.delete(k);
      },
    },
  });
  vm.runInContext(pointsRuntime, ctx);
  return { ctx, records };
}

test('pontos aparecem inteiros, sem conversão de centavos ou moeda real', () => {
  const { ctx } = runtime();
  assert.equal(ctx.__formatPoints(1000), '1.000 pontos');
  assert.equal(ctx.__formatPoints(1), '1 ponto');
  assert.equal(ctx.__formatPoints(0), '0 pontos');
  for (const value of [
    -1,
    1.2,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    null,
    undefined,
    '',
    '   ',
    false,
    true,
    [],
    {},
  ])
    assert.equal(ctx.__formatPoints(value), 'Indisponível');
  assert.equal(ctx.__formatPoints('100'), '100 pontos');
});

test('convite válido persiste no reenvio e vai somente aos endpoints de login', () => {
  const { ctx, records } = runtime('?convite=amigo_12345');
  assert.equal(records.get('brasilia-referral'), 'amigo_12345');
  for (const path of ['/api/auth/email/request', '/api/auth/email/verify']) {
    assert.equal(ctx.__withReferral(path, { email: 'a@example.org' }).referralCode, 'amigo_12345');
  }
  assert.equal(ctx.__withReferral('/api/jogos/manifestacao/acesso', {}).referralCode, undefined);
  assert.equal(
    ctx.__withReferral('https://outro.test/api/auth/email/request', {}).referralCode,
    undefined,
  );
  ctx.__clearReferral();
  assert.equal(records.has('brasilia-referral'), false);
  assert.equal(ctx.__withReferral('/api/auth/email/request', {}).referralCode, undefined);
});

test('convite inválido não substitui convite válido guardado e armazenamento bloqueado não quebra login', () => {
  const { ctx } = runtime('?convite=%3Cscript%3E', 'amigo_12345');
  assert.equal(ctx.__withReferral('/api/auth/email/request', {}).referralCode, 'amigo_12345');
  const denied = runtime('?convite=outro_12345', null, true);
  assert.equal(
    denied.ctx.__withReferral('/api/auth/email/request', {}).referralCode,
    'outro_12345',
  );
  assert.doesNotThrow(() => denied.ctx.__clearReferral());
  assert.equal(
    runtime('?convite=curto').ctx.__withReferral('/api/auth/email/request', {}).referralCode,
    undefined,
  );
});

function element(tag, className, text = '') {
  return {
    tag,
    className,
    textContent: text,
    children: [],
    attributes: {},
    setAttribute(key, value) {
      this.attributes[key] = value;
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    focus() {
      this.focused = true;
    },
    select() {
      this.selected = true;
    },
    closest() {
      return this.dialog;
    },
  };
}
async function pointsDialog({ clipboard = true, wallet = {} } = {}) {
  const { ctx } = runtime();
  const dialogs = [];
  let copied = '';
  Object.assign(ctx, {
    gn: () => ({ id: 'user' }),
    T: element,
    qt: async () => ({
      balance: 300,
      welcomePoints: 300,
      referral: {
        code: 'amigo_12345',
        inviterReward: 100,
        inviteeReward: 100,
        rewardedInvites: 2,
        maxRewards: 100,
      },
      ledger: [{ amount: 300, reason: 'welcome' }],
      ...wallet,
    }),
    navigator: {
      clipboard: clipboard
        ? {
            async writeText(v) {
              copied = v;
            },
          }
        : null,
    },
    Gi: { open: true, contains: () => true },
    ii: (...nodes) => dialogs.push(nodes),
    Zr: (text, onclick) => ({ textContent: text, onclick }),
    ro() {},
  });
  await ctx.__openPoints();
  return { ctx, dialogs, copied: () => copied };
}

for (const failure of [false, true]) {
  test(`carteira ignora ${failure ? 'erro' : 'saldo'} atrasado após troca de conta`, async () => {
    const { ctx, dialogs } = await pointsDialog();
    let resolve, reject;
    ctx.qt = () =>
      new Promise((done, fail) => {
        resolve = done;
        reject = fail;
      });
    const opening = ctx.__openPoints();
    const count = dialogs.length;
    assert.equal(dialogs.at(-1)[2].attributes.role, 'status');
    ctx.gn = () => ({ id: 'outra-conta' });
    if (failure) reject(Error('Falha da conta anterior'));
    else resolve({ balance: 1234 });
    await opening;
    assert.equal(dialogs.length, count);
    assert.equal(dialogs.at(-1)[2].textContent, 'Consultando seu saldo…');
  });
}

test('carteira mostra saldo, recompensa do convidado e copia URL da própria origem', async () => {
  const result = await pointsDialog({
    wallet: {
      referral: {
        code: 'amigo_12345',
        url: 'https://malicioso.test',
        inviterReward: 100,
        inviteeReward: 100,
        rewardedInvites: 2,
        maxRewards: 100,
      },
    },
  });
  const nodes = result.dialogs.at(-1).slice(1);
  assert.ok(nodes.some((node) => node.textContent === 'Saldo: 300 pontos'));
  assert.ok(nodes.some((node) => node.textContent.includes('seu amigo ganha 100 pontos')));
  assert.ok(
    nodes.some((node) => node.textContent.includes('compra de pontos ainda não está disponível')),
  );
  const input = nodes.find((node) => node.tag === 'input');
  assert.equal(input.readOnly, true);
  assert.equal(input.value, 'https://manifestacoes.com/?convite=amigo_12345');
  await nodes.find((node) => node.textContent === 'Copiar convite').onclick();
  assert.equal(result.copied(), input.value);
});

test('extrato usa direção do débito mesmo com valor positivo e reconhece bônus do convidado', async () => {
  const result = await pointsDialog({
    wallet: {
      ledger: [
        { amount: 100, direction: 'debit', reason: 'purchase:bandeira:brasil' },
        { amount: 100, direction: 'credit', reason: 'referral_invited' },
      ],
    },
  });
  const list = result.dialogs.at(-1).find((node) => node?.tag === 'ul');
  assert.equal(list.children[0].children[0].textContent, '−');
  assert.equal(list.children[1].children[0].textContent, '+');
  assert.equal(list.children[1].children[1].textContent, 'Bônus de convite: 100 pontos');
});

test('cópia sem Clipboard API seleciona link e explica cópia manual', async () => {
  const result = await pointsDialog({ clipboard: false });
  const nodes = result.dialogs.at(-1).slice(1);
  await nodes.find((node) => node.textContent === 'Copiar convite').onclick();
  assert.equal(nodes.find((node) => node.tag === 'input').selected, true);
  assert.ok(nodes.some((node) => node.textContent === 'Selecione e copie o link acima.'));
});

test('telões em preparação exibem detalhes e preservam consulta sem botão de aquisição', () => {
  const { ctx } = runtime();
  let dialog, opened;
  Object.assign(ctx, {
    T: element,
    Gr: () => [{ id: 'painel-1', name: 'Congresso' }],
    St: (className, textContent, onclick) => ({ className, textContent, onclick }),
    ih: (id) => {
      opened = id;
    },
    la: (...nodes) => {
      dialog = nodes;
    },
    ro() {},
  });
  ctx.__pointsAdPreparation();
  assert.equal(dialog[0].textContent, 'Anúncios em preparação');
  assert.match(dialog[1].textContent, /nenhum ponto será descontado/);
  const details = dialog.find((node) => node.tag === 'ul').children[0].children[1];
  details.onclick();
  assert.equal(opened, 'painel-1');
  assert.equal(
    dialog.some((node) => node.className === 'primary'),
    false,
  );
});

test('patch mantém sintaxe do cliente, preços e formulários inteiros e falha com âncoras desconhecidas', () => {
  const original = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  const patched = requireServedArtifact(original, 'const Re = __formatPoints;');
  assert.doesNotThrow(() => babel.parsers.babel.parse(patched));
  assert.ok(patched.includes('const Re = __formatPoints;'));
  assert.ok(patched.includes('Gastar ${Re(o)}'));
  assert.ok(patched.includes('JSON.stringify(__withReferral(path, body))'));
  assert.ok(patched.includes('Resgate com pontos · permanente'));
  assert.ok(!patched.includes('n.min / 100'));
  assert.ok(!patched.includes('Number(d.value.replace(",", ".")) * 100'));
  assert.ok(!patched.includes('Simular compra'));
  assert.ok(patched.includes('function No() { return __simpleAds(); }'));
  const pricing = patched.slice(
    patched.indexOf('function __designsFree()'),
    patched.indexOf('function sf()'),
  );
  const context = vm.createContext({
    xt: { user: { acesso: { active: true }, cartazLivre: true }, media: { designPoints: 100 } },
  });
  vm.runInContext(pricing, context);
  assert.equal(context.Br('cartaz'), false);
  assert.equal(context.Br('bandeira'), false);
  context.xt.user.designsFree = true;
  context.xt.media.designPoints = 0;
  assert.equal(context.Br('cartaz'), true);
  assert.equal(context.Br('bandeira'), true);
  assert.equal(context.xt.user.acesso.active, true);
  context.xt = null;
  assert.equal(context.Br('cartaz'), false);
  assert.ok(!patched.includes('async function M4(n, e)'));
  assert.ok(!patched.includes('Valor por telão'));
  assert.throws(() => applyPointsClient('cliente incompatível'), /incompatível/);
});

function adsRuntime() {
  const { ctx } = runtime();
  vm.runInContext(simpleAdsRuntime, ctx);
  const screens = [
    { id: 'tela-1', name: 'Congresso', aspect: '16:9' },
    { id: 'tela-2', name: 'Catedral', aspect: '9:16' },
  ];
  const dialogs = [],
    requests = [];
  const selected = new Set(['tela-1', 'tela-2']);
  Object.assign(ctx, {
    Zi() {},
    ah() {},
    ro() {
      for (const node of dialogs.at(-1) ?? []) node.dialog.open = false;
    },
    No() {},
    an: '/api/jogos/manifestacao',
    T: element,
    St: (className, textContent, onclick) => ({ className, textContent, onclick }),
    Gr: () => screens,
    he: { selected },
    gn: () => ({ id: 'u1' }),
    qi: { mine: { bids: [] } },
    _a: async () => ({ signedIn: true, rules: { maxMB: 20 } }),
    la: (...nodes) => {
      for (const node of dialogs.at(-1) ?? []) node.isConnected = false;
      for (const node of nodes) {
        node.isConnected = true;
        node.dialog = { open: true };
      }
      dialogs.push(nodes);
    },
    Cj: () => [{ id: 'media-1', created: Date.now(), copies: { '16:9': 'a', '9:16': 'b' } }],
    tr: async () => {},
    qt: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { status: 'paid', paid: true, points: 200 };
    },
  });
  return { ctx, dialogs, requests };
}

test('publicação de telões mostra preço fixo sem input de lance e debita total de telas', async () => {
  const { ctx, dialogs, requests } = adsRuntime();
  await ctx.__simpleAdOrder();
  const nodes = dialogs.at(-1);
  assert.ok(nodes.some((node) => node.textContent === 'Total: 200 pontos'));
  assert.equal(nodes.filter((node) => node.tag === 'input').length, 1);
  assert.equal(
    nodes.find((node) => node.tag === 'input').accept,
    'image/png,image/jpeg,image/webp',
  );
  const publish = nodes.find((node) => node.textContent === 'Publicar 24h · 200 pontos');
  assert.equal(publish.disabled, true);
  nodes.find((node) => node.textContent.startsWith('Usar anúncio aprovado')).onclick();
  assert.equal(publish.disabled, false);
  await publish.onclick();
  assert.equal(requests.length, 1);
  assert.match(requests[0].body.requestId, /^[A-Za-z0-9_-]{8,100}$/);
  const { requestId, ...purchaseBody } = requests[0].body;
  assert.deepEqual(JSON.parse(JSON.stringify(purchaseBody)), {
    items: [
      { screen: 'tela-1', cents: 100 },
      { screen: 'tela-2', cents: 100 },
    ],
    media: ['a', 'b'],
  });
  assert.equal(dialogs.at(-1)[0].textContent, 'Anúncio publicado');
});

test('upload novo rejeita vídeo antes de enviar e preserva opção aprovada legada', async () => {
  const { ctx, dialogs, requests } = adsRuntime();
  await ctx.__simpleAdOrder();
  const nodes = dialogs.at(-1),
    file = nodes.find((node) => node.tag === 'input');
  file.files = [{ type: 'video/mp4', size: 100 }];
  await file.onchange();
  assert.ok(nodes.some((node) => node.textContent === 'Use somente PNG, JPEG ou WebP estática.'));
  assert.equal(requests.length, 0);
  assert.equal(
    nodes.find((node) => node.textContent === 'Publicar 24h · 200 pontos').disabled,
    true,
  );
});

test('cancelamento de campanha exige confirmação e mostra devolução proporcional', async () => {
  const { ctx, dialogs, requests } = adsRuntime();
  ctx.qi.mine.bids = [
    {
      id: 'b1',
      screen: 'tela-1',
      ref: 'r1',
      pricingMode: 'fixed',
      status: 'live',
      expiresAt: Date.now() + 1000,
    },
  ];
  const controls = ctx.__simpleOwnedAds();
  const cancel = controls.find((node) => node.textContent.startsWith('Cancelar campanha:'));
  cancel.onclick();
  assert.equal(requests.length, 0);
  const confirmation = dialogs.at(-1);
  assert.ok(
    confirmation.some((node) => node.textContent.includes('proporcionalmente ao tempo restante')),
  );
  ctx.qt = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { refundedPoints: 75 };
  };
  await confirmation.find((node) => node.textContent === 'Confirmar cancelamento').onclick();
  assert.equal(requests[0].url, '/api/jogos/manifestacao/telao/cancelar');
  assert.equal(requests[0].body.ref, 'r1');
  assert.ok(dialogs.at(-1).some((node) => node.textContent === 'Devolução: 75 pontos'));
});

test('renderer real mantém o sexto anúncio pago na rotação do telão', () => {
  const generated = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  // Exercita o método realmente gerado; não replica a implementação do renderer.
  const start = generated.indexOf('  setPlaylist(e, t, i) {');
  const end = generated.indexOf('\n  advance(', start);
  assert.ok(start > 0 && end > start);
  const Renderer = vm.runInNewContext('(class {' + generated.slice(start, end) + '})');
  const renderer = new Renderer(),
    slot = {};
  let advanced = 0;
  renderer.slots = new Map([['screen', slot]]);
  renderer.clock = () => 123;
  renderer.advance = () => {
    advanced++;
  };
  const campaigns = Array.from({ length: 6 }, (_, index) => ({ id: String(index) }));
  renderer.setPlaylist('screen', campaigns, 100);
  assert.equal(slot.playlist.length, 6);
  assert.equal(slot.playlist[5].id, '5');
  assert.equal(slot.rotationSince, 100);
  assert.equal(advanced, 1);
  campaigns.pop();
  assert.equal(slot.playlist.length, 6, 'playlist é uma cópia independente');
});

test('anúncios ativos recentes continuam visíveis após histórico antigo e todos podem cancelar', () => {
  const { ctx } = adsRuntime();
  ctx.qi.mine.bids = [
    ...Array.from({ length: 80 }, (_, index) => ({
      id: 'old-' + index,
      screen: 'tela-1',
      ref: 'old-ref-' + index,
      status: 'expired',
      createdAt: index + 1,
    })),
    ...Array.from({ length: 100 }, (_, index) => ({
      id: 'new-' + index,
      screen: 'tela-1',
      ref: 'new-ref-' + index,
      pricingMode: 'fixed',
      status: 'live',
      createdAt: 1000 + index,
    })),
  ];
  const nodes = ctx.__simpleOwnedAds();
  const list = nodes.find((node) => node.tag === 'ul');
  assert.equal(list.children.length, 150);
  assert.match(list.children[0].textContent, /Em rotação/);
  assert.equal(
    nodes.filter((node) => node.textContent.startsWith('Cancelar campanha:')).length,
    100,
  );
});

test('biblioteca usa createdAt, fallback created e não exibe Invalid Date', async () => {
  const { ctx, dialogs } = adsRuntime();
  ctx.Cj = () => [
    { id: 'm1', createdAt: '2026-10-17T10:00:00Z' },
    { id: 'm2', created: 1770000000000 },
    { id: 'm3', createdAt: 'errada' },
  ];
  await ctx.__simpleAdOrder();
  const options = dialogs
    .at(-1)
    .filter((node) => node.textContent.startsWith('Usar anúncio aprovado'));
  assert.equal(options.length, 3);
  assert.match(options[0].textContent, /17/);
  assert.equal(options[2].textContent, 'Usar anúncio aprovado');
  assert.ok(options.every((node) => !node.textContent.includes('Invalid Date')));
});

test('extrato identifica designs, campanhas, devoluções e superchat', async () => {
  const result = await pointsDialog({
    wallet: {
      ledger: [
        { amount: 100, direction: 'debit', reason: 'design' },
        { amount: 100, direction: 'debit', reason: 'screen_campaign' },
        { amount: 50, direction: 'credit', reason: 'screen_cancel' },
        { amount: 50, direction: 'debit', reason: 'superchat' },
      ],
    },
  });
  const list = result.dialogs.at(-1).find((node) => node?.tag === 'ul');
  assert.deepEqual(
    list.children.map((row) => row.children[1].textContent),
    [
      'Design personalizado: 100 pontos',
      'Anúncio nos telões: 100 pontos',
      'Devolução de anúncio: 50 pontos',
      'Superchat: 50 pontos',
    ],
  );
});

test('reenvio após falha de rede preserva chave e clique repetido não duplica publicação', async () => {
  const { ctx, dialogs, requests } = adsRuntime();
  await ctx.__simpleAdOrder();
  const nodes = dialogs.at(-1);
  nodes.find((node) => node.textContent.startsWith('Usar anúncio aprovado')).onclick();
  const publish = nodes.find((node) => node.textContent.startsWith('Publicar 24h'));
  let release;
  ctx.qt = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    await new Promise((resolve) => {
      release = resolve;
    });
    throw Error('Conexão interrompida');
  };
  const first = publish.onclick();
  await publish.onclick();
  assert.equal(requests.length, 1);
  release();
  await first;
  assert.equal(publish.disabled, false);
  ctx.qt = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { paid: true, points: 200 };
  };
  await publish.onclick();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].body.requestId, requests[0].body.requestId);
});

test('cancelamento identifica campanha e não oferece devolução para leilão legado', () => {
  const { ctx } = adsRuntime();
  ctx.qi.mine.bids = [
    { id: 'one', ref: 'campaign', screen: 'tela-1', pricingMode: 'fixed', status: 'live' },
    { id: 'two', ref: 'campaign', screen: 'tela-2', pricingMode: 'fixed', status: 'live' },
    { id: 'legacy', ref: 'old', screen: 'tela-2', status: 'live' },
  ];
  const controls = ctx
    .__simpleOwnedAds()
    .filter((node) => node.textContent.startsWith('Cancelar campanha:'));
  assert.equal(controls.length, 1);
  assert.match(controls[0].textContent, /Congresso e mais 1 telão/);
});

test('clique repetido na confirmação não repete cancelamento', async () => {
  const { ctx, dialogs, requests } = adsRuntime();
  ctx.qi.mine.bids = [
    { id: 'one', ref: 'campaign', screen: 'tela-1', pricingMode: 'fixed', status: 'live' },
  ];
  ctx
    .__simpleOwnedAds()
    .find((node) => node.textContent.startsWith('Cancelar campanha:'))
    .onclick();
  const confirm = dialogs.at(-1).find((node) => node.textContent === 'Confirmar cancelamento');
  let release;
  ctx.qt = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    await new Promise((resolve) => {
      release = resolve;
    });
    return { refundedPoints: 75 };
  };
  const first = confirm.onclick();
  await confirm.onclick();
  assert.equal(requests.length, 1);
  release();
  await first;
});

test('texturas antigas de anúncios são reduzidas a 1024 mantendo proporção', () => {
  const { ctx } = runtime();
  const calls = [];
  const canvas = { getContext: () => ({ drawImage: (...args) => calls.push(args) }) };
  ctx.document = { createElement: () => canvas };
  const image = { width: 4096, height: 2048 },
    texture = { image };
  ctx.__limitScreenTexture(texture);
  assert.equal(texture.image, canvas);
  assert.equal(canvas.width, 1024);
  assert.equal(canvas.height, 512);
  assert.equal(texture.needsUpdate, true);
  assert.equal(calls[0][0], image);
  const small = { image: { width: 512, height: 1024 } };
  ctx.__limitScreenTexture(small);
  assert.equal(small.needsUpdate, undefined);
  ctx.document.createElement = () => {
    throw Error('Canvas indisponível');
  };
  assert.doesNotThrow(() => ctx.__limitScreenTexture({ image }));
});

test('seleção dos telões anuncia total atualizado para leitor de tela', () => {
  const { ctx, dialogs } = adsRuntime();
  ctx.__simpleAds();
  const nodes = dialogs.at(-1),
    summary = nodes.find((node) => node.attributes?.role === 'status');
  assert.equal(summary.attributes['aria-live'], 'polite');
  assert.equal(summary.textContent, '2 telões · 200 pontos · 24 horas');
  const first = nodes.find((node) => node.className === 'telao-list').children[0].children[0];
  first.checked = false;
  first.onchange();
  assert.equal(summary.textContent, '1 telão · 100 pontos · 24 horas');
});

test('ofertas exibem designs grátis com conta, preservando anúncios e destaques com pontos', () => {
  const generated = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  assert.ok(generated.includes('Designs gratuitos com conta · até 20 salvos'));
  assert.ok(generated.includes('return __designsFree() ? "Sem custo com conta"'));
  assert.ok(generated.includes('Use pontos para anúncios nos telões e destaques no chat.'));
  assert.ok(generated.includes('100 pontos por telão durante 24 horas.'));
  assert.ok(generated.includes('const y = r >= n.min && r <= n.max && (!c || r >= n.voiceMin);'));
  const pricingStart = generated.indexOf('function __designsFree()');
  const pricingEnd = generated.indexOf('function Br()', pricingStart);
  const context = vm.createContext({
    __freeAccess: () => true,
    gn: () => context.xt.user,
    xt: { user: {}, media: { designPoints: 0 } },
  });
  vm.runInContext(generated.slice(pricingStart, pricingEnd), context);
  assert.equal(context.__designPoints(), 0);
  assert.equal(context.__designPriceLabel(), 'Sem custo com conta');
  context.xt.user = null;
  assert.equal(context.__designsFree(), false, 'Upload pessoal gratuito continua exigindo conta');
  assert.equal(context.__designPriceLabel(), 'Grátis com login');
  context.__freeAccess = () => false;
  context.xt.user = {};
  context.xt.media.designPoints = 100;
  context.__formatPoints = (value) => `${value} pontos`;
  assert.equal(context.__designPriceLabel(), '100 pontos por design');
  for (const obsolete of [
    'Cartazes de uso ilimitado · até 20 salvos',
    'Cartazes sem cobrança por criação',
    'Cartazes incluídos disponíveis:',
    'Ilimitados · incluídos no passe, após aprovação',
    'Abra Meus cartazes para criar sem pagar',
  ])
    assert.ok(!generated.includes(obsolete), `Promessa antiga removida: ${obsolete}`);
});

test('menu mobile ignora título vazio e preserva rótulo Passes e acessibilidade', () => {
  const { ctx } = runtime();
  const passes = {
    title: '',
    textContent: 'Passes',
    getAttribute: () => null,
    querySelector: () => null,
  };
  assert.equal(ctx.__menuActionLabel(passes, ''), 'Passes');
  assert.equal(
    ctx.__menuActionLabel({ ...passes, getAttribute: () => ' Passes permanentes ' }, ''),
    'Passes permanentes',
  );
  assert.equal(ctx.__menuActionLabel(passes, 'Tela cheia'), 'Tela cheia');
  assert.equal(
    ctx.__menuActionLabel(
      { title: '', textContent: '', querySelector: () => ({ textContent: ' ' }) },
      '',
    ),
    'Ação do jogo',
  );
});

test('recompensa designs informa preço zero sem conceder Premium nem confiar no sinal legado', () => {
  const ctx = vm.createContext({ xt: null });
  vm.runInContext(pointsRuntime + designPricingRuntime, ctx);
  assert.equal(ctx.__designPoints(), 100);
  assert.equal(ctx.__designsFree(), false);
  ctx.xt = { user: { cartazLivre: true, acesso: { active: true } }, media: { designPoints: 100 } };
  assert.equal(ctx.__designsFree(), false);
  assert.equal(ctx.__designPriceLabel(), '100 pontos por design');
  ctx.xt = { user: { designsFree: true, acesso: { active: false } }, media: { designPoints: 0 } };
  assert.equal(ctx.__designPoints(), 0);
  assert.equal(ctx.__designPriceLabel(), 'Sem custo · recompensa de missão');
  assert.equal(ctx.xt.user.acesso.active, false);
  ctx.xt = { user: {}, media: { designPoints: 0 } };
  assert.equal(ctx.__designsFree(), true);
  ctx.xt = { user: {}, media: { designPoints: 250 } };
  assert.equal(ctx.__designPriceLabel(), '250 pontos por design');
  ctx.xt = { user: {}, media: { designPoints: -10 } };
  assert.equal(ctx.__designPoints(), 100);
});

test('consulta atrasada de anúncios não substitui a janela atual', async () => {
  const { ctx, dialogs } = adsRuntime();
  let resolve;
  ctx._a = () =>
    new Promise((done) => {
      resolve = done;
    });
  const opening = ctx.__simpleAdOrder();
  assert.equal(dialogs.at(-1)[0].textContent, 'Publicar anúncio');
  ctx.la(element('h2', '', 'Outra janela'));
  resolve({ signedIn: true });
  await opening;
  assert.equal(dialogs.at(-1)[0].textContent, 'Outra janela');
});

test('resposta da publicação após navegar preserva janela atual', async () => {
  const { ctx, dialogs } = adsRuntime();
  await ctx.__simpleAdOrder();
  const nodes = dialogs.at(-1);
  nodes.find((node) => node.textContent.startsWith('Usar anúncio aprovado')).onclick();
  let resolve;
  ctx.qt = () =>
    new Promise((done) => {
      resolve = done;
    });
  const publishing = nodes.find((node) => node.textContent.startsWith('Publicar 24h')).onclick();
  ctx.la(element('h2', '', 'Outra janela'));
  resolve({ paid: true, points: 200 });
  await publishing;
  assert.equal(dialogs.at(-1)[0].textContent, 'Outra janela');
});

test('exclusão de mídia exige confirmação e chama endpoint de exclusão', async () => {
  const { ctx, dialogs, requests } = adsRuntime();
  await ctx.__simpleAdOrder();
  dialogs
    .at(-1)
    .find((node) => node.textContent === 'Excluir mídia aprovada')
    .onclick();
  assert.equal(requests.length, 0);
  assert.equal(dialogs.at(-1)[0].textContent, 'Excluir mídia?');
  ctx.qt = async (url, options) => {
    requests.push({ url, method: options.method });
    return { status: 'deleted', ids: ['media-1'] };
  };
  await dialogs
    .at(-1)
    .find((node) => node.textContent === 'Confirmar exclusão da mídia')
    .onclick();
  assert.deepEqual(requests, [
    { url: '/api/jogos/manifestacao/telao/midia?id=media-1', method: 'DELETE' },
  ]);
  assert.equal(dialogs.at(-1)[0].textContent, 'Mídia excluída');
});

test('mídia em uso mantém confirmação aberta com erro e permite voltar', async () => {
  const { ctx, dialogs } = adsRuntime();
  await ctx.__simpleAdOrder();
  dialogs
    .at(-1)
    .find((node) => node.textContent === 'Excluir mídia aprovada')
    .onclick();
  ctx.qt = async () => {
    throw Error('Mídia usada em anúncio ativo');
  };
  const confirm = dialogs.at(-1).find((node) => node.textContent === 'Confirmar exclusão da mídia');
  await confirm.onclick();
  assert.equal(dialogs.at(-1)[0].textContent, 'Excluir mídia?');
  assert.equal(confirm.disabled, false);
  assert.ok(dialogs.at(-1).some((node) => node.textContent === 'Mídia usada em anúncio ativo'));
});

test('fechar diálogo durante consulta não reabre tela após a resposta', async () => {
  const { ctx, dialogs } = adsRuntime();
  let resolve;
  ctx._a = () =>
    new Promise((done) => {
      resolve = done;
    });
  const opening = ctx.__simpleAdOrder();
  ctx.ro();
  resolve({ signedIn: true });
  await opening;
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs.at(-1)[0].dialog.open, false);
});

test('exclusão com limpeza pendente informa espaço ainda ocupado', async () => {
  const { ctx, dialogs } = adsRuntime();
  await ctx.__simpleAdOrder();
  dialogs
    .at(-1)
    .find((node) => node.textContent === 'Excluir mídia aprovada')
    .onclick();
  ctx.qt = async () => ({ status: 'deleted', cleanupPending: true });
  await dialogs
    .at(-1)
    .find((node) => node.textContent === 'Confirmar exclusão da mídia')
    .onclick();
  assert.equal(dialogs.at(-1)[0].textContent, 'Mídia excluída');
  assert.ok(
    dialogs
      .at(-1)
      .some((node) => node.textContent.includes('espaço ainda pode permanecer ocupado')),
  );
  assert.ok(
    !dialogs
      .at(-1)
      .some((node) => node.textContent === 'O espaço foi liberado para novos arquivos.'),
  );
});

for (const destination of ['closed', 'replaced', 'account']) {
  test(`cópia de convite rejeitada após ${destination} não recupera foco da carteira anterior`, async () => {
    const view = await pointsDialog();
    const nodes = view.dialogs.at(-1);
    const input = nodes.find((node) => node?.tag === 'input');
    let rejectCopy;
    view.ctx.navigator.clipboard.writeText = () =>
      new Promise((_resolve, reject) => {
        rejectCopy = reject;
      });
    const copying = nodes.find((node) => node?.textContent === 'Copiar convite').onclick();
    if (destination === 'closed') view.ctx.Gi.open = false;
    if (destination === 'replaced') view.ctx.Gi.contains = () => false;
    if (destination === 'account') view.ctx.gn = () => ({ id: 'outra-conta' });
    rejectCopy(Error('Clipboard indisponível'));
    await copying;
    assert.equal(input.focused, undefined);
    assert.equal(input.selected, undefined);
  });
}
