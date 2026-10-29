import test from 'node:test';
import assert from 'node:assert/strict';
import { initWorld, handleWorldMessage, onPlayerLeave } from '../src/world-actions.js';
import { tickAttractions, isProtected } from '../src/attractions.js';
import { canOccupy } from '../src/simulation.js';
import { readFileSync } from 'node:fs';
const { places } = JSON.parse(readFileSync(new URL('../src/world-data.json', import.meta.url)));
function setup() {
  const p = { id: 1, userId: 'qa', x: 0, z: 0, mode: 0, team: 0, pvp: { on: true } };
  const sent = [],
    all = [];
  const ctx = {
    freeAccess: true,
    state: { users: [{ id: 'qa' }] },
    players: new Map([[1, p]]),
    save() {},
    sendPlayer(p, msg) {
      sent.push({ id: p.id, ...msg });
    },
    broadcast(msg) {
      all.push(msg);
    },
    random: () => 0,
  };
  initWorld(p, ctx);
  return { p, ctx, sent, all, pr: ctx.state.world.progress.qa.secret, s: ctx.state.world.secret };
}
function act(f, id, key) {
  const place = places.find((x) => x.id === id),
    a = place.actions.find((x) => x.key === key);
  f.p.x = place.x + a.x;
  f.p.z = place.z + a.z;
  handleWorldMessage(f.p, { t: 'secret_place', place: id, action: key }, f.ctx);
}
const progress = (p, ctx) => ctx.state.world.progress[p.userId];
function clock(t, fn) {
  const original = Date.now;
  Date.now = () => t;
  try {
    return fn();
  } finally {
    Date.now = original;
  }
}
test('elevador replica trajeto público, bloqueia concorrente e retorna ao térreo', () =>
  clock(10000, () => {
    const f = setup();
    act(f, 'triplex', 'lift-3');
    assert.equal(f.s.rides[0].actual, 6);
    assert.equal(f.s.rides[0].ground, 0.15);
    assert.equal(f.p.secretRide, true);
    assert.equal(f.s.rides[0].until, 16500);
    act(f, 'triplex', 'lift-9');
    assert.equal(f.s.rides.length, 1);
    clock(16501, () => tickAttractions(f.p, f.ctx, progress));
    assert.equal(f.p.secretRide, false);
    assert.equal(f.p.z, -112.5);
  }));
test('proteção altar dura10s e recarrega60s sem curar falsamente', () =>
  clock(10000, () => {
    const f = setup();
    f.pr.hp = 25;
    act(f, 'temple', 'blessing');
    assert.equal(isProtected(f.p, f.ctx), true);
    assert.equal(f.pr.hp, 25);
    assert.equal(f.pr.templeReadyAt, 70000);
    act(f, 'temple', 'blessing');
    assert.equal(f.s.wards.length, 1);
    clock(20001, () => assert.equal(isProtected(f.p, f.ctx), false));
  }));
test('portais deslocam a pé para destinos livres sem criar fichas e sem repetir', () =>
  clock(10000, () => {
    const f = setup();
    act(f, 'tire-camp', 'travel-north');
    assert.equal(f.p.z, -529);
    assert.equal(f.pr.coins, 5);
    assert.equal(
      f.sent.some((x) => x.t === 'relocate'),
      true,
    );
    act(f, 'tire-camp', 'travel-et');
    assert.equal(f.pr.ready['tire-camp'], 25000);
    assert.equal(f.p.z, 236);
    clock(25001, () => act(f, 'tire-camp', 'travel-et'));
    assert.equal(f.p.z, 189);
  }));
test('banco debita uma ficha, aplica efeito e rejeita replay durante cooldown', () =>
  clock(10000, () => {
    const f = setup();
    act(f, 'bank', 'transfer-token');
    assert.equal(f.pr.coins, 7);
    assert.equal(f.s.effects[0].kind, 'coins');
    act(f, 'bank', 'transfer-token');
    assert.equal(f.pr.coins, 7);
    for (const [value, kind] of [
      [0.3, 'heal'],
      [0.6, 'shield'],
      [0.9, 'confetti'],
    ]) {
      f.pr.ready.bank = 0;
      f.ctx.random = () => value;
      act(f, 'bank', 'transfer-token');
      assert.equal(f.s.effects.at(-1).kind, kind);
    }
  }));
test('congresso cobra3 uma única vez, bloqueia coleta externa e permite prêmio dentro', () =>
  clock(10000, () => {
    const f = setup();
    assert.equal(canOccupy(-216, -409, 0.1, f.ctx), false);
    act(f, 'congress', 'open-gate');
    assert.equal(f.pr.coins, 2);
    act(f, 'congress', 'open-gate');
    assert.equal(f.pr.coins, 2);
    act(f, 'congress', 'collect-emenda');
    assert.equal(f.pr.coins, 2);
    clock(10701, () => {
      assert.equal(canOccupy(-216, -409, 0.1, f.ctx), true);
      act(f, 'congress', 'collect-emenda');
      assert.equal(f.pr.coins, 7);
      act(f, 'congress', 'collect-emenda');
      assert.equal(f.pr.coins, 7);
    });
    clock(20001, () => {
      f.p.z = -411;
      tickAttractions(f.p, f.ctx, progress);
      assert.equal(f.p.z, -407);
      assert.equal(canOccupy(-216, -409, 0.1, f.ctx), false);
    });
  }));
test('proximidade inválida e coordenadas não finitas nunca causam efeito', () =>
  clock(10000, () => {
    const f = setup();
    handleWorldMessage(f.p, { t: 'secret_place', place: 'congress', action: 'open-gate' }, f.ctx);
    assert.equal(f.pr.coins, 5);
    f.p.x = NaN;
    f.p.z = -407.2;
    handleWorldMessage(f.p, { t: 'secret_place', place: 'congress', action: 'open-gate' }, f.ctx);
    assert.equal(f.pr.coins, 5);
  }));
test('boss exige ingresso vivo, só contribuintes recebem fichas e golpe tem cooldown', () =>
  clock(10000, () => {
    const f = setup();
    f.pr.hp = 0;
    act(f, 'liberty', 'wake-boss');
    assert.equal(f.s.boss.until, 0);
    f.pr.hp = 100;
    act(f, 'liberty', 'wake-boss');
    act(f, 'liberty', 'strike-boss');
    act(f, 'liberty', 'strike-boss');
    assert.equal(f.s.boss.hp, 90);
    for (let i = 1; i < 10; i++) clock(10000 + i * 801, () => act(f, 'liberty', 'strike-boss'));
    assert.equal(f.s.boss.hp, 0);
    assert.equal(f.pr.coins, 10);
    act(f, 'liberty', 'strike-boss');
    assert.equal(f.pr.coins, 10);
  }));
test('onda dourada atinge faixa expandida uma vez e respeita proteção e não participantes', () =>
  clock(10000, () => {
    const f = setup();
    act(f, 'liberty', 'wake-boss');
    f.p.x = 226;
    f.p.z = 357;
    clock(15000, () => tickAttractions(f.p, f.ctx, progress));
    assert.equal(f.pr.hp, 100);
    clock(16500, () => tickAttractions(f.p, f.ctx, progress));
    assert.equal(f.pr.hp, 80);
    clock(16800, () => tickAttractions(f.p, f.ctx, progress));
    assert.equal(f.pr.hp, 80);
    f.s.wards.push({ owner: 1, until: 50000 });
    clock(20000, () => tickAttractions(f.p, f.ctx, progress));
    clock(21800, () => tickAttractions(f.p, f.ctx, progress));
    assert.equal(f.pr.hp, 80);
  }));
test('lançador produz projétil, respeita consentimento, impacto único e proteção', () =>
  clock(10000, () => {
    const f = setup();
    f.p.yaw = 0;
    act(f, 'chair-plaza', 'launch-chair');
    assert.equal(f.s.chairs.length, 1);
    act(f, 'chair-plaza', 'launch-chair');
    assert.equal(f.s.chairs.length, 1);
    const target = { id: 2, userId: 'b', x: -216, z: 192, team: 1, pvp: { on: true } };
    f.ctx.players.set(2, target);
    initWorld(target, f.ctx);
    clock(10500, () => tickAttractions(f.p, f.ctx, progress));
    assert.equal(f.all.filter((x) => x.t === 'physical').length, 1);
    clock(11000, () => tickAttractions(f.p, f.ctx, progress));
    assert.equal(f.all.filter((x) => x.t === 'physical').length, 1);
  }));
test('paredes param cadeiras antes de atingir alvos atrás delas', () =>
  clock(10000, () => {
    const f = setup();
    f.p.yaw = Math.PI;
    act(f, 'chair-plaza', 'launch-chair');
    const target = { id: 2, userId: 'b', x: -216, z: 174, team: 1, pvp: { on: true } };
    f.ctx.players.set(2, target);
    initWorld(target, f.ctx);
    clock(11601, () => tickAttractions(f.p, f.ctx, progress));
    assert.equal(f.all.filter((x) => x.t === 'physical').length, 0);
  }));
test('espectador não interage e cadeira perde validade sem consentimento de quem disparou', () =>
  clock(10000, () => {
    const f = setup();
    f.p.spectator = true;
    act(f, 'congress', 'open-gate');
    assert.equal(f.pr.coins, 5);
    assert.equal(f.s.gate.until, 0);
    f.p.spectator = false;
    f.p.yaw = 0;
    act(f, 'chair-plaza', 'launch-chair');
    const target = { id: 2, userId: 'b', x: -216, z: 192, team: 1, pvp: { on: true } };
    f.ctx.players.set(2, target);
    initWorld(target, f.ctx);
    f.p.pvp.on = false;
    clock(10500, () => tickAttractions(f.p, f.ctx, progress));
    assert.equal(f.all.filter((x) => x.t === 'physical').length, 0);
    assert.equal(f.s.chairs.length, 0);
  }));
test('cadeiras não atingem espectador, alvo sem PvP ou protegido', () => {
  for (const mode of ['spectator', 'off', 'ward'])
    clock(10000, () => {
      const f = setup();
      f.p.yaw = 0;
      act(f, 'chair-plaza', 'launch-chair');
      const target = {
        id: 2,
        userId: 'b',
        x: -216,
        z: 192,
        team: 1,
        pvp: { on: mode !== 'off' },
        spectator: mode === 'spectator',
      };
      f.ctx.players.set(2, target);
      initWorld(target, f.ctx);
      if (mode === 'ward') f.s.wards.push({ owner: 2, until: 50000 });
      clock(10500, () => tickAttractions(f.p, f.ctx, progress));
      assert.equal(f.all.filter((x) => x.t === 'physical').length, 0);
    });
});

test('reinício elimina IDs transitórios e preserva progresso, fichas e produção', () =>
  clock(10000, () => {
    const f = setup();
    f.pr.coins = 22;
    f.pr.hp = 51;
    f.s.factory.produced = 7;
    f.s.wind.fill = 50;
    act(f, 'triplex', 'lift-3');
    f.s.wards.push({ owner: 1, until: 99999 });
    f.s.chairs.push({ owner: 1, until: 99999 });
    const state = structuredClone(f.ctx.state),
      other = { id: 1, userId: 'other', x: 0, z: 0 };
    const ctx = { ...f.ctx, state };
    delete ctx.localWorld;
    const welcome = initWorld(other, ctx);
    assert.equal(welcome.secretPlaces.rides.length, 0);
    assert.equal(welcome.secretPlaces.wards.length, 0);
    assert.equal(welcome.secretPlaces.chairs.length, 0);
    assert.equal(state.world.progress.qa.secret.coins, 22);
    assert.equal(state.world.progress.qa.secret.hp, 51);
    assert.equal(welcome.secretPlaces.factory.produced, 7);
    assert.equal(welcome.secretPlaces.wind.fill, 50);
  }));
test('desconexão do elevador limpa posse e salva posição de saída para reconectar', () =>
  clock(10000, () => {
    const f = setup();
    act(f, 'triplex', 'lift-3');
    f.s.wards.push({ owner: 1, until: 99999 });
    f.ctx.localWorld.bossParticipants = new Set([1]);
    onPlayerLeave(f.p, f.ctx);
    assert.equal(f.p.secretRide, false);
    assert.equal(f.p.z, -112.5);
    assert.equal(f.s.rides.length, 0);
    assert.equal(f.s.wards.length, 0);
    assert.equal(f.ctx.localWorld.bossParticipants.has(1), false);
  }));

test('cadeira revalida o acesso PvP ao lançar e no impacto, inclusive depois da revogação', () => {
  for (const stage of ['launch', 'owner', 'target'])
    clock(10000, () => {
      const f = setup();
      f.ctx.freeAccess = false;
      f.ctx.state.users[0].owned = { pvpEnabled: stage !== 'launch' };
      f.p.yaw = 0;
      act(f, 'chair-plaza', 'launch-chair');
      if (stage === 'launch') {
        assert.equal(f.s.chairs.length, 0);
        assert.equal(f.pr.ready['chair-plaza'], undefined);
        return;
      }
      assert.equal(f.s.chairs.length, 1);
      const target = { id: 2, userId: 'b', x: -216, z: 192, team: 1, pvp: { on: true } };
      f.ctx.players.set(2, target);
      f.ctx.state.users.push({ id: 'b', owned: { pvpEnabled: true } });
      initWorld(target, f.ctx);
      f.ctx.state.users[stage === 'owner' ? 0 : 1].owned.pvpEnabled = false;
      clock(10500, () => tickAttractions(f.p, f.ctx, progress));
      assert.equal(f.all.filter((message) => message.t === 'physical').length, 0);
    });
});
