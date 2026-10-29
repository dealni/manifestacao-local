import test from 'node:test';
import assert from 'node:assert/strict';
import { initWorld, handleWorldMessage, worldTick } from '../src/world-actions.js';

function fixture(production = true, state = { world: {} }) {
  const messages = [],
    snapshots = [];
  const ctx = {
    production,
    config: { production },
    state,
    players: new Map(),
    sendPlayer(player, message) {
      messages.push({ id: player.id, ...structuredClone(message) });
    },
    save() {
      snapshots.push(JSON.parse(JSON.stringify(state)));
    },
    broadcast() {},
  };
  return { ctx, messages, snapshots };
}
const guest = (id) => ({ id, team: 0, x: 0, z: 0, mode: 0 });

test('produção mantém missões e atrações do visitante por conexão, fora do estado durável', () => {
  const f = fixture(),
    player = guest(1);
  const welcome = initWorld(player, f.ctx);
  welcome.secretProgress.coins = 17;
  worldTick(player, f.ctx);
  player.worldPrevious.at -= 1000;
  player.x = 10;
  worldTick(player, f.ctx);
  f.ctx.onRaceFinish(player, { place: 1 });
  const mission = f.messages.filter((message) => message.t === 'missions').at(-1).state;
  assert.equal(mission.counts.walk, 10);
  assert.equal(mission.counts.raceFinishes, 1);
  assert.equal(mission.counts.raceWins, 1);
  assert.equal(initWorld(player, f.ctx).secretProgress.coins, 17);
  assert.deepEqual(f.ctx.state.world.progress, {});
  assert.ok(f.snapshots.length > 0);
  assert.ok(f.snapshots.every((snapshot) => Object.keys(snapshot.world.progress).length === 0));
  // Outra conexão pode reutilizar o número, mas não o progresso anterior.
  assert.equal(initWorld(guest(1), f.ctx).secretProgress.coins, 5);
});

test('produção remove visitantes legados sem apagar contas nem retomar IDs após reinício', () => {
  const original = fixture(false),
    visitor = guest(2);
  initWorld(visitor, original.ctx).secretProgress.coins = 99;
  const account = { ...guest(3), user: { id: 'conta-real' } };
  initWorld(account, original.ctx).secretProgress.coins = 31;
  const restarted = fixture(true, JSON.parse(JSON.stringify(original.ctx.state)));
  assert.equal(initWorld(guest(2), restarted.ctx).secretProgress.coins, 5);
  assert.deepEqual(Object.keys(restarted.ctx.state.world.progress), ['conta-real']);
  assert.equal(initWorld({ ...account, id: 8 }, restarted.ctx).secretProgress.coins, 31);
  assert.equal(restarted.ctx.state.world.progress['conta-real'].secret.coins, 31);
});

test('produção não acumula entradas de missões após muitas conexões de visitantes', () => {
  const f = fixture();
  for (let id = 1; id <= 1000; id++) {
    const player = guest(id);
    initWorld(player, f.ctx);
    handleWorldMessage(player, { t: 'missions' }, f.ctx);
  }
  f.ctx.save();
  assert.deepEqual(f.snapshots[0].world.progress, {});
});

test('conta autenticada persiste por identidade e não recebe o progresso efêmero do visitante', () => {
  const f = fixture(),
    player = guest(4);
  initWorld(player, f.ctx).secretProgress.coins = 50;
  player.user = { id: 'conta-autenticada' };
  assert.equal(initWorld(player, f.ctx).secretProgress.coins, 5);
  initWorld(player, f.ctx).secretProgress.coins = 23;
  f.ctx.onRaceFinish(player, { place: 2 });
  const restart = fixture(true, JSON.parse(JSON.stringify(f.ctx.state)));
  const restored = { ...guest(9), userId: 'conta-autenticada' };
  assert.equal(initWorld(restored, restart.ctx).secretProgress.coins, 23);
  assert.equal(
    restart.ctx.state.world.progress['conta-autenticada'].mission.counts.raceFinishes,
    1,
  );
});

test('modo local conserva progresso dos visitantes pela chave legada', () => {
  const f = fixture(false),
    player = guest(7);
  initWorld(player, f.ctx).secretProgress.coins = 42;
  assert.equal(f.ctx.state.world.progress['guest:7'].secret.coins, 42);
  assert.equal(initWorld(guest(7), f.ctx).secretProgress.coins, 42);
});
