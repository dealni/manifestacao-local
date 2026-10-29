import { requireServedArtifact } from './helpers/served-artifact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { applyFreeAccessClient } from '../scripts/free-access-client.js';

const raw = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const source = requireServedArtifact(raw, 'function __freeAccess()');
function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const lineEnd = source.indexOf('\n', start);
  if (source.slice(start, lineEnd).endsWith('}')) return source.slice(start, lineEnd);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
function helpers(xt) {
  const context = vm.createContext({ xt });
  for (const name of [
    'gn',
    '__freeAccess',
    '__gameAccess',
    '__gamePvp',
    '__gameObjects',
    '$i',
    'Gm',
    '$x',
    'Hd',
  ])
    vm.runInContext(declaration(name), context);
  vm.runInContext(
    source
      .slice(
        source.indexOf('const zi ='),
        source.indexOf('  du = new Map()', source.indexOf('const zi =')),
      )
      .replace(/,\s*$/, ';'),
    context,
  );
  return context;
}

test('acesso livre não inventa identidade e oferece os direitos enviados pelo servidor', () => {
  const context = helpers({
    freeAccess: true,
    user: null,
    access: {
      acesso: true,
      passes: ['total'],
      personagens: ['skin'],
      bandeiras: ['brasil'],
      veiculos: ['dirigivel'],
      pvp: true,
      objetos: ['foam'],
    },
  });
  assert.equal(vm.runInContext('gn()', context), null);
  assert.equal(vm.runInContext('$i() && __gamePvp()', context), true);
  for (const [call, expected] of [
    ['Gm()', ['total']],
    ['zi()', ['skin']],
    ['$x()', ['brasil']],
    ['Hd()', ['dirigivel']],
    ['__gameObjects()', ['foam']],
  ])
    assert.deepEqual(Array.from(vm.runInContext(call, context)), expected);
});

test('modo normal não aceita direitos livres sem flag e preserva benefícios da conta', () => {
  const context = helpers({
    freeAccess: false,
    access: { acesso: true, pvp: true, veiculos: ['dirigivel'] },
    user: { id: 'u1', veiculos: ['moto'], pvpItems: ['push'] },
  });
  assert.equal(vm.runInContext('$i() || __gamePvp()', context), false);
  assert.deepEqual(Array.from(vm.runInContext('Hd()', context)), ['moto']);
  assert.equal(vm.runInContext('gn().id', context), 'u1');
});

test('liberação de item usa estado local confirmado sem chamada de compra ou ticket falso', async () => {
  let closed = 0;
  const context = helpers({ freeAccess: true, access: { veiculos: ['dirigivel'] }, user: null });
  Object.assign(context, {
    ro() {
      closed++;
    },
    Vc() {
      return null;
    },
    cn: true,
  });
  vm.runInContext('async ' + declaration('Wr'), context);
  const result = await vm.runInContext(
    'Wr({endpoint:"veiculo",owned:Hd},"dirigivel","Dirigível")',
    context,
  );
  assert.equal(result.freeAccess, true);
  assert.equal(closed, 1);
  const ticketContext = vm.createContext({
    B1: null,
    Yf: '',
    qu() {
      throw new Error('Não deve gerar ticket');
    },
    Y: {
      send() {
        throw new Error('Não deve autenticar visitante');
      },
    },
  });
  vm.runInContext(declaration('ol'), ticketContext);
  assert.doesNotThrow(() => vm.runInContext('ol({freeAccess:true})', ticketContext));
});

test('corrida e seleção aceitam visitante sem remover login de pontos, uploads e social', () => {
  assert.ok(
    source.includes('s = __freeAccess() || !!gn(),\n      o = this.net.actors.get(this.net.id),'),
  );
  assert.ok(source.includes('!e.price || $x().includes(e.key)'));
  assert.ok(source.includes('if (!gn() || !panel.signedIn) return Ea("entrar");'));
  assert.ok(source.includes('if (!gn()) return Ea("entrar");'));
  assert.ok(source.includes('if (!gn()) { Ea("entrar"); return; }'));
  assert.ok(source.includes('function gn() {\n  return xt?.user ?? null;\n}'));
});

test('anúncios e destaques continuam com pontos; designs pessoais grátis com conta e spray liberado', () => {
  assert.ok(source.includes('let r = n.suggested.includes(1e3) ? 1e3 : n.min,'));
  assert.ok(source.includes('const y = r >= n.min && r <= n.max && (!c || r >= n.voiceMin);'));
  assert.ok(source.includes('M("VALOR"),'));
  assert.ok(source.includes('100 pontos por telão durante 24 horas.'));
  assert.ok(source.includes('T("b", "", "100 pontos / 24h")'));
  assert.ok(source.includes('Use pontos para anúncios nos telões e destaques no chat.'));
  assert.ok(source.includes('"Sem custo com conta"'));
  assert.ok(source.includes('if (!cn || (!gn() && !__freeAccess())) return Me();'));
  assert.ok(!source.includes('Denunciar esta mensagem à IA'));
  assert.ok(source.includes('Solicitação de denúncia enviada'));
  assert.ok(!source.includes('"Publicar grátis"'));
});

test('patch final mantém sintaxe válida e integra geração depois de todos os patches de UI', () => {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    input: source,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const generator = fs.readFileSync(
    new URL('../scripts/prepare-client.js', import.meta.url),
    'utf8',
  );
  assert.ok(
    generator.indexOf('source = applyFreeAccessClient(source);') >
      generator.indexOf('source = applyCleanOverlays(source);'),
  );
  assert.throws(() => applyFreeAccessClient('function other() {}'), /incompatível/);
});

test('metadados de passes e benefícios não acessam a conta antes de let xt inicializar', () => {
  const start = source.indexOf('const yx = [');
  const end = source.indexOf(',\n  oB = ', start);
  assert.ok(start >= 0 && end > start);
  const metadata = source.slice(start, end);
  assert.ok(!metadata.includes('__freeAccess('), 'Catálogo inicial usa somente strings estáticas');
  const context = vm.createContext({
    __freeAccess() {
      throw new Error('Acesso prematuro à conta');
    },
  });
  vm.runInContext(metadata + ';globalThis.offerMetadata = { yx, Mx }; let xt = null;', context);
  assert.equal(context.offerMetadata.yx.length, 3);
  assert.ok(
    Array.from(context.offerMetadata.Mx).includes('Designs gratuitos com conta · até 20 salvos'),
  );
  const beforeAccount = source.slice(0, source.indexOf('let xt = null;'));
  assert.ok(
    !beforeAccount.includes('__freeAccess('),
    'Nenhum uso do helper ocorre no prefixo anterior à conta',
  );
});

test('cartaz pessoal comunica login grátis sem autenticar visitante nem liberar upload anônimo', () => {
  const context = helpers({ freeAccess: true, user: null, media: { designPoints: 0 } });
  Object.assign(context, { __formatPoints: (value) => `${value} pontos` });
  for (const name of ['__designsFree', '__designPoints', '__designPriceLabel'])
    vm.runInContext(declaration(name), context);
  assert.equal(vm.runInContext('__designPriceLabel()', context), 'Grátis com login');
  assert.equal(vm.runInContext('__designsFree()', context), false);
  context.xt.user = { id: 'u1' };
  assert.equal(vm.runInContext('__designPriceLabel()', context), 'Sem custo com conta');
  assert.equal(vm.runInContext('__designsFree()', context), true);
  context.xt.freeAccess = false;
  context.xt.media.designPoints = 100;
  assert.equal(vm.runInContext('__designPriceLabel()', context), '100 pontos por design');
  assert.ok(source.includes('Benefícios liberados'));
  assert.ok(!source.includes('Premium · pontos'));
  assert.ok(!source.includes('guardar compras e seu visual'));
});
