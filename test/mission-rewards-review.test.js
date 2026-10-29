import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initWorld, handleWorldMessage } from '../src/world-actions.js';
import { FLAG_KEYS, buildAccount } from '../src/economy.js';
import { playerEntitlements, sanitizeAppearance } from '../src/game-permissions.js';

const { missions } = JSON.parse(
  readFileSync(new URL('../src/world-data.json', import.meta.url), 'utf8'),
);
function fixture(index) {
  const user = { id: 'a', owned: { veiculos: ['carro'], objetos: ['push'] } };
  const player = { id: 1, userId: 'a', x: 200, z: 200, team: 0 };
  let saves = 0;
  const ctx = {
    state: { users: [user] },
    players: new Map([[1, player]]),
    save() {
      saves++;
    },
    sendPlayer() {},
  };
  initWorld(player, ctx);
  const mission = ctx.state.world.progress.a.mission;
  mission.index = index;
  return { user, player, ctx, mission, saves: () => saves };
}

for (const [id, group, key] of [
  ['primeiras-marcas', 'veiculos', 'moto'],
  ['abrindo-caminho', 'objetos', 'pillow'],
  ['circuito-bairros', 'veiculos', 'chopper'],
  ['primeiro-podio', 'objetos', 'foam'],
  ['peso-pesado', 'veiculos', 'carreta'],
  ['som-de-rua', 'veiculos', 'caixa'],
  ['na-frente', 'veiculos', 'carro-som'],
  ['dono-das-ruas', 'veiculos', 'caminhao-som'],
]) {
  test(`concluir ${id} concede ${key} na conta e salva sem cobrar pontos`, () => {
    const index = missions.findIndex((m) => m.id === id),
      f = fixture(index),
      definition = missions[index];
    Object.assign(f.mission.counts, definition.goals, { activeMs: definition.minutes * 60000 });
    if (definition.goals.travel) f.mission.counts.walk = definition.goals.travel;
    const untouched = structuredClone(f.user.owned[group === 'veiculos' ? 'objetos' : 'veiculos']);
    handleWorldMessage(f.player, { t: 'missions' }, f.ctx);
    assert.equal(f.mission.index, index + 1);
    assert.ok(f.user.owned[group].includes(key));
    assert.ok(playerEntitlements(f.player, f.ctx)[group].includes(key));
    assert.deepEqual(f.user.owned[group === 'veiculos' ? 'objetos' : 'veiculos'], untouched);
    assert.equal(f.saves(), 1);
    assert.equal(f.user.pointsWallet, undefined);
  });
}

test('conclusão antiga recupera item perdido uma vez e não confia no reward gravado', () => {
  const f = fixture(0);
  f.mission.completed = [{ id: 'circuito-bairros', at: 1, reward: 'total' }];
  handleWorldMessage(f.player, { t: 'missions' }, f.ctx);
  assert.deepEqual(f.user.owned.veiculos, ['carro', 'chopper']);
  assert.equal(f.saves(), 1);
  handleWorldMessage(f.player, { t: 'missions' }, f.ctx);
  assert.deepEqual(f.user.owned.veiculos, ['carro', 'chopper']);
  assert.equal(f.saves(), 1);
  assert.equal(f.user.owned.passes, undefined);
});

test('contadores insuficientes não concedem itens', () => {
  const f = fixture(2),
    before = structuredClone(f.user);
  handleWorldMessage(f.player, { t: 'missions' }, f.ctx);
  assert.deepEqual(f.user, before);
  assert.equal(f.saves(), 0);
});

test('conclusões desconhecidas não inventam benefícios', () => {
  const f = fixture(0),
    before = structuredClone(f.user);
  f.mission.completed = [{ id: 'inexistente', reward: 'total' }, null, { reward: 'designs' }];
  handleWorldMessage(f.player, { t: 'missions' }, f.ctx);
  assert.deepEqual(f.user, before);
  assert.equal(f.saves(), 0);
});

test('evento missions renova a conta HTTP e atualiza itens em cache sem recarregar a página', async () => {
  const vm = await import('node:vm');
  const source = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  const listenerStart = source.indexOf('e.addEventListener("missions", (r) => {');
  const bodyStart = source.indexOf('{', listenerStart) + 1;
  const bodyEnd = source.indexOf('\n      }));', bodyStart);
  assert.ok(listenerStart > 0 && bodyEnd > bodyStart);
  const refreshStart = source.indexOf('async function Ds() {');
  const refreshEnd = source.indexOf('\nfunction $x()', refreshStart);
  assert.ok(refreshStart > 0 && refreshEnd > refreshStart);
  // ts depende do controle de identidade; exercitar também suas declarações reais.
  const storeStart = source.indexOf('let __authIdentityEpoch = 0;');
  const storeEnd = source.indexOf('\nfunction Vc()', storeStart);
  assert.ok(storeStart > 0 && storeEnd > storeStart);
  let requests = 0,
    notifications = 0,
    interfaceUpdates = 0;
  const sandbox = {
    cn: true,
    xt: { user: { id: 'mission-user', veiculos: ['carro'] } },
    an: '/api/jogos/manifestacao',
    qt: async (path) => {
      assert.equal(path, '/api/jogos/manifestacao/conta');
      requests++;
      return { user: { id: 'mission-user', veiculos: ['carro', 'chopper'] } };
    },
    vd: null,
    A_() {
      assert.fail('conta renovada não deve limpar autenticação');
    },
    iy() {
      interfaceUpdates++;
    },
    Ux: [
      (user) => {
        notifications++;
        assert.deepEqual(user.veiculos, ['carro', 'chopper']);
      },
    ],
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `${source.slice(storeStart, storeEnd)}\n${source.slice(refreshStart, refreshEnd)}\nglobalThis.listener=function(r){${source.slice(bodyStart, bodyEnd)}}`,
    sandbox,
  );
  const ui = {
    received: true,
    completed: new Set(),
    initialRefresh: true,
    catalog() {
      return missions;
    },
    toast() {},
    renderCard() {},
    panel: { open: false },
  };
  sandbox.listener.call(ui, {
    detail: { state: { completed: [{ id: 'circuito-bairros' }], starter: true } },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 1);
  assert.deepEqual(sandbox.xt.user.veiculos, ['carro', 'chopper']);
  assert.equal(notifications, 1, 'ts real deve notificar assinantes da conta');
  assert.equal(interfaceUpdates, 1, 'ts real deve solicitar atualização da interface');
  sandbox.listener.call(ui, {
    detail: { state: { completed: [{ id: 'circuito-bairros' }], starter: true } },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 1, 'repetir o mesmo estado não volta a consultar a conta');
  assert.equal(notifications, 1);
});

for (const [id, flags] of [
  ['bandeiras-alto', ['brasil-premium', 'pt-premium']],
  ['colecao-completa', FLAG_KEYS],
]) {
  test(`${id} concede bandeiras utilizáveis e repara o histórico sem duplicar`, () => {
    const f = fixture(0);
    f.mission.completed = [{ id, reward: 'total' }];
    handleWorldMessage(f.player, { t: 'missions' }, f.ctx);
    assert.deepEqual(f.user.owned.bandeiras, flags);
    assert.equal(f.saves(), 1);
    // Flags 4 e 13 preservam todos os outros bits de aparência e são renderizáveis.
    for (const flag of [4, 13]) {
      const appearance = (flag << 12) | 7;
      assert.equal(sanitizeAppearance(f.player, f.ctx, appearance), appearance);
    }
    const restored = JSON.parse(JSON.stringify(f.ctx.state));
    const ctx = { ...f.ctx, state: restored };
    handleWorldMessage(f.player, { t: 'missions' }, ctx);
    assert.deepEqual(restored.users[0].owned.bandeiras, flags);
    assert.equal(f.saves(), 1);
    assert.equal(restored.users[0].premium, undefined);
    assert.equal(restored.users[0].owned.passes, undefined);
  });
}

test('Minha assinatura libera designs sem conceder Premium ou crédito e persiste por conta', () => {
  const f = fixture(missions.findIndex((m) => m.id === 'minha-assinatura'));
  const definition = missions[f.mission.index];
  Object.assign(f.mission.counts, definition.goals, { activeMs: definition.minutes * 60000 });
  handleWorldMessage(f.player, { t: 'missions' }, f.ctx);
  assert.equal(f.user.owned.designsFree, true);
  assert.equal(f.saves(), 1);
  assert.equal(f.user.premium, undefined);
  assert.equal(f.user.pointsWallet, undefined);
  const restored = JSON.parse(JSON.stringify(f.ctx.state));
  const account = buildAccount({ state: restored }, restored.users[0]);
  assert.equal(account.user.designsFree, true);
  assert.equal(account.user.cartazLivre, true);
  assert.equal(account.user.premium, false);
  assert.equal(account.user.cartazesIlimitados, false);
  assert.equal(account.media.designPoints, 0);
  assert.equal(account.cartazes.cartaz, 0);
  assert.equal(account.cartazes.bandeira, 0);
  assert.equal(account.media.ads.pricePerScreen, 100);
  assert.equal(account.superchat.min, 100);
  const other = buildAccount({ state: restored }, { id: 'other' });
  assert.equal(other.user.designsFree, false);
  assert.equal(other.media.designPoints, 100);
  handleWorldMessage(f.player, { t: 'missions' }, f.ctx);
  assert.equal(f.saves(), 1);
});

test('visitante não recebe recompensas em outra conta nem grava owned avulso', () => {
  const f = fixture(0);
  delete f.player.userId;
  initWorld(f.player, f.ctx);
  const progress = f.ctx.state.world.progress['guest:1'].mission;
  progress.completed = [{ id: 'minha-assinatura' }, { id: 'colecao-completa' }];
  const before = structuredClone(f.user);
  handleWorldMessage(f.player, { t: 'missions' }, f.ctx);
  assert.deepEqual(f.user, before);
  assert.equal(f.player.owned, undefined);
  assert.equal(f.saves(), 0);
});
