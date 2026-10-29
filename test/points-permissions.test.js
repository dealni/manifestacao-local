import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUseCharacter,
  canUseSkin,
  canUseVehicle,
  sanitizeAppearance,
} from '../src/game-permissions.js';
import { handleWorldMessage, initWorld } from '../src/world-actions.js';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { attachRealtime } from '../src/realtime.js';
function fixture() {
  const user = { id: 'u', owned: {} },
    player = { id: 1, user, userId: 'u', team: 0, x: 0, z: 0 },
    messages = [];
  const ctx = {
    state: { users: [user], world: {} },
    catalog: {
      items: [
        { key: 'super-xandao', baseCharacter: 12 },
        { key: 'custom', baseCharacter: 0 },
      ],
    },
    players: new Map([[1, player]]),
    save() {},
    sendPlayer(p, m) {
      messages.push(m);
    },
    broadcast() {},
  };
  return { user, player, ctx, messages };
}
test('personagens especiais exigem propriedade; modelos básicos continuam disponíveis', () => {
  const f = fixture();
  for (const character of [0, 1, 2, 3, 4, 8, 9])
    assert.equal(canUseCharacter(f.player, f.ctx, character), true);
  assert.equal(canUseCharacter(f.player, f.ctx, 12), false);
  assert.equal(canUseCharacter(f.player, f.ctx, 63), false);
  assert.equal(canUseSkin(f.player, f.ctx, 'custom'), false);
  f.user.owned.skins = ['super-xandao', 'custom'];
  assert.equal(canUseCharacter(f.player, f.ctx, 12), true);
  assert.equal(canUseSkin(f.player, f.ctx, 'custom'), true);
  assert.equal(canUseSkin(f.player, f.ctx, 'unknown'), false);
  // A permissão consulta a conta atual, não uma cópia antiga no player.
  f.ctx.state.users[0] = { id: 'u', owned: {} };
  assert.equal(canUseCharacter(f.player, f.ctx, 12), false);
});
test('carro e moto básicos seguem livres; garagem libera veículos catalogados', () => {
  const f = fixture();
  for (const mode of [0, 1, 7]) assert.equal(canUseVehicle(f.player, f.ctx, mode), true);
  assert.equal(canUseVehicle(f.player, f.ctx, 12), false);
  f.user.owned.passes = ['garagem'];
  assert.equal(canUseVehicle(f.player, f.ctx, 12), true);
  assert.equal(canUseVehicle(f.player, f.ctx, 31), false);
});
test('PvP e objetos são verificados no evento e ataque; visitante pode desligar', () => {
  const f = fixture();
  initWorld(f.player, f.ctx);
  handleWorldMessage(f.player, { t: 'pvp', on: true, weapon: 'fish' }, f.ctx);
  assert.equal(f.player.pvp.on, false);
  f.user.owned = { pvpEnabled: true, objetos: ['fish'] };
  handleWorldMessage(f.player, { t: 'pvp', on: true, weapon: 'fish' }, f.ctx);
  assert.equal(f.player.pvp.on, true);
  f.ctx.state.users = [];
  let attacks = 0;
  f.ctx.broadcast = (m) => {
    if (m.t === 'physical') attacks++;
  };
  handleWorldMessage(f.player, { t: 'attack' }, f.ctx);
  assert.equal(attacks, 0);
  handleWorldMessage(f.player, { t: 'pvp', on: true, weapon: 'fish' }, f.ctx);
  assert.equal(f.player.pvp.on, false);
  handleWorldMessage(f.player, { t: 'pvp', on: false }, f.ctx);
  assert.equal(f.player.pvp.on, false);
});
test('WebSocket rejeita bypass de join, resume, estilo e veículo sem alterar transporte básico', async (t) => {
  const server = createServer(),
    f = fixture(),
    ctx = { ...f.ctx, dataDir: '/tmp' };
  const rt = attachRealtime(server, ctx);
  server.on('upgrade', (req, socket, head) =>
    rt.wss.handleUpgrade(req, socket, head, (ws) => rt.wss.emit('connection', ws, req)),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await rt.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`),
    messages = [];
  ws.on('message', (data, binary) => {
    if (!binary) messages.push(JSON.parse(data));
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(
    JSON.stringify({
      t: 'join',
      nick: 'Visitante',
      character: 12,
      skin: 'super-xandao',
      appearance: (4 << 12) | 3,
      resume: { x: 0, z: 100, mode: 12 },
    }),
  );
  async function wait(check) {
    const until = Date.now() + 2000;
    while (Date.now() < until) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error('Timeout');
  }
  await wait(() => messages.some((m) => m.t === 'welcome'));
  const p = [...ctx.players.values()][0];
  assert.equal(p.character, 0);
  assert.equal(p.skin, '');
  assert.equal(p.mode, 0);
  assert.equal(p.appearance, 3);
  ws.send(
    JSON.stringify({
      t: 'style',
      character: 12,
      skin: 'super-xandao',
      appearance: (10 << 12) | (1 << 19) | 3,
    }),
  );
  ws.send(JSON.stringify({ t: 'vehicle', kind: 12 }));
  await wait(() => messages.some((m) => m.t === 'notice'));
  assert.equal(p.character, 0);
  assert.equal(p.skin, '');
  assert.equal(p.mode, 0);
  assert.equal(p.appearance, 3);
  ws.send(JSON.stringify({ t: 'vehicle', kind: 7 }));
  await wait(() => p.mode === 7);
  assert.ok(p.vehicle);
});

test('bandeiras e objetos de mão respeitam propriedade sem alterar cabelo, pele ou acessório', () => {
  const f = fixture(),
    otherBits = 3 | (2 << 3) | (4 << 6) | (1 << 9) | (2 << 16),
    withFlag = (id) => otherBits | ((id & 15) << 12) | (((id >> 4) & 1) << 19);
  for (const flag of [0, 1, 2, 3, 10, 11, 12, 18, 19])
    assert.equal(sanitizeAppearance(f.player, f.ctx, withFlag(flag)), withFlag(flag));
  for (const flag of [4, 9, 13, 20, 21, 26, 27, 29])
    assert.equal(sanitizeAppearance(f.player, f.ctx, withFlag(flag)), otherBits);
  f.user.owned.bandeiras = ['brasil-premium', 'ype'];
  assert.equal(sanitizeAppearance(f.player, f.ctx, withFlag(4)), withFlag(4));
  assert.equal(sanitizeAppearance(f.player, f.ctx, withFlag(26)), withFlag(26));
  f.ctx.state.designs = [
    { id: 'design', userId: 'u', kind: 'cartaz', paid: true, status: 'approved' },
  ];
  f.player.design = 'design';
  assert.equal(sanitizeAppearance(f.player, f.ctx, withFlag(30)), withFlag(30));
  assert.equal(sanitizeAppearance(f.player, f.ctx, withFlag(31)), otherBits);
  f.ctx.state.designs[0].status = 'pending';
  assert.equal(sanitizeAppearance(f.player, f.ctx, withFlag(30)), otherBits);
});
