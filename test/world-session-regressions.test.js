import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initWorld,
  handleWorldMessage,
  onPlayerLeave,
  transferWorldProgress,
  worldTick,
} from '../src/world-actions.js';

function fixture() {
  const messages = [],
    broadcasts = [];
  const ctx = {
    freeAccess: true,
    state: { users: [], world: {} },
    players: new Map(),
    save() {},
    sendPlayer(player, message) {
      messages.push({ id: player.id, ...structuredClone(message) });
    },
    broadcast(message) {
      broadcasts.push(structuredClone(message));
    },
  };
  const player = { id: 1, x: 40, z: 0, team: 0, mode: 0 };
  ctx.players.set(player.id, player);
  return { player, ctx, messages, broadcasts };
}

test('retomada validada transfere fichas e missões efêmeras sem persistir visitante', () => {
  const f = fixture();
  initWorld(f.player, f.ctx).secretProgress.coins = 42;
  f.ctx.onRaceFinish(f.player, { place: 1 });
  onPlayerLeave(f.player, f.ctx);
  const resumed = { id: 1, x: 40, z: 0, team: 0, mode: 0 };
  transferWorldProgress(f.player, resumed);
  assert.equal(initWorld(resumed, f.ctx).secretProgress.coins, 42);
  handleWorldMessage(resumed, { t: 'missions' }, f.ctx);
  assert.equal(f.messages.at(-1).state.counts.raceWins, 1);
  assert.deepEqual(f.ctx.state.world.progress, {});
  assert.equal(initWorld({ ...resumed }, f.ctx).secretProgress.coins, 5);
  assert.equal(initWorld(f.player, f.ctx).secretProgress.coins, 5);
});

test('transferência de sessão não importa progresso para outra identidade ou conta autenticada', () => {
  for (const identity of [{ id: 2 }, { userId: 'account' }, { user: { id: 'account' } }]) {
    const f = fixture();
    initWorld(f.player, f.ctx).secretProgress.coins = 42;
    const resumed = { ...f.player, ...identity };
    transferWorldProgress(f.player, resumed);
    assert.equal(initWorld(resumed, f.ctx).secretProgress.coins, 5);
    assert.equal(initWorld(f.player, f.ctx).secretProgress.coins, 42);
  }
  const f = fixture();
  f.player.userId = 'account';
  initWorld(f.player, f.ctx).secretProgress.coins = 42;
  const resumed = { id: f.player.id };
  transferWorldProgress(f.player, resumed);
  assert.equal(initWorld(resumed, f.ctx).secretProgress.coins, 5);
});

test('ir ao palanque não concede caminhada ou atividade e limpa movimento pendente', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 10000 });
  const f = fixture();
  initWorld(f.player, f.ctx);
  worldTick(f.player, f.ctx);
  f.player.input = { x: 1, z: 1, run: true };
  f.player.speed = 10;
  t.mock.timers.tick(1000);
  handleWorldMessage(f.player, { t: 'palanque_ir' }, f.ctx);
  worldTick(f.player, f.ctx);
  handleWorldMessage(f.player, { t: 'missions' }, f.ctx);
  assert.deepEqual(f.messages.at(-1).state.counts, {});
  assert.deepEqual(f.player.input, { x: 0, z: 0, run: false });
  assert.equal(f.player.speed, 0);
  assert.deepEqual(f.player.worldPrevious, { x: -18.2, z: -43.5, at: 11000 });
  t.mock.timers.tick(1000);
  f.player.x += 1;
  worldTick(f.player, f.ctx);
  assert.equal(f.messages.at(-1).state.counts.walk, 1);
  assert.equal(f.messages.at(-1).state.counts.activeMs, 1000);
});

test('desconectar remove fonte de áudio e avisa clientes sem afetar outra caixa', () => {
  const f = fixture();
  initWorld(f.player, f.ctx);
  handleWorldMessage(f.player, { t: 'som', a: 'play', track: 'd5' }, f.ctx);
  const other = { id: 2, x: 41, z: 0, team: 1 };
  handleWorldMessage(other, { t: 'som', a: 'play', track: 'e5' }, f.ctx);
  assert.equal(f.ctx.localWorld.sounds.size, 2);
  onPlayerLeave(f.player, f.ctx);
  assert.equal(f.ctx.localWorld.sounds.has(f.player.id), false);
  assert.equal(f.ctx.localWorld.sounds.has(other.id), true);
  assert.deepEqual(
    f.broadcasts.filter((message) => message.t === 'som_off'),
    [{ t: 'som_off', p: 1 }],
  );
  assert.deepEqual(
    initWorld({ id: 3 }, f.ctx).sounds.map((sound) => sound.p),
    [2],
  );
  onPlayerLeave(f.player, f.ctx);
  assert.equal(f.broadcasts.filter((message) => message.t === 'som_off').length, 1);
});
