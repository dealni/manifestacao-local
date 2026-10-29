import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createLocalServer } from '../src/server.js';
import {
  canUseCharacter,
  canUseVehicle,
  canUseSkin,
  canUsePvp,
  sanitizeAppearance,
} from '../src/game-permissions.js';

async function fixture(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifestacao-open-access-'));
  const app = await createLocalServer({ dataDir, port: 0 });
  const address = await app.listen();
  t.after(async () => {
    await app.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${address.port}`;
  const json = async (route, body, cookie) => {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  };
  return { app, base, json };
}
test('instalação padrão libera catálogo para visitante sem autenticar ou conceder acesso a dados privados', async (t) => {
  const { app, json } = await fixture(t),
    { ctx } = app;
  const response = await json('/api/jogos/manifestacao/conta');
  assert.equal(response.status, 200);
  const account = response.body;
  assert.equal(account.freeAccess, true);
  assert.equal(account.authenticated, false);
  assert.equal(account.user, null);
  assert.equal(account.ticket, null);
  assert.equal(account.access.veiculos.length, 13);
  assert.equal(account.access.objetos.length, 6);
  assert.equal(account.access.personagens.length, ctx.catalog.length);
  for (const items of [
    account.personagens,
    account.veiculos,
    account.bandeiras,
    account.objetos,
    account.passes,
  ])
    assert.ok(items.every((item) => item.points === 0 && item.cents === 0));
  assert.equal(account.media.designPoints, 0);
  assert.equal(account.media.ads.pricePerScreen, 100);
  assert.equal(account.superchat.min, 100);
  for (let i = 0; i <= 14; i++) assert.equal(canUseCharacter({}, ctx, i), true);
  for (const mode of [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    assert.equal(canUseVehicle({}, ctx, mode), true);
  assert.equal(canUseVehicle({}, ctx, 31), false);
  assert.equal(canUseCharacter({}, ctx, 99), false);
  assert.equal(canUseSkin({}, ctx, ctx.catalog[0].key), true);
  assert.equal(canUseSkin({}, ctx, 'inventado'), false);
  assert.equal(canUsePvp({}, ctx, 'fish'), true);
  assert.equal(canUsePvp({}, ctx, 'inventado'), false);
  assert.equal(sanitizeAppearance({}, ctx, 4 << 12), 4 << 12);
  assert.equal(sanitizeAppearance({}, ctx, (14 << 12) | (1 << 19)), 0);
  assert.equal((await json('/api/jogos/manifestacao/loja?owned=1')).body.total, ctx.catalog.length);
  assert.equal((await json('/api/jogos/manifestacao/visual', { character: 12 })).status, 401);
  assert.equal((await json('/api/jogos/manifestacao/cartaz/ativar', { id: 'alheio' })).status, 401);
  assert.equal((await json('/api/jogos/manifestacao/pontos')).status, 401);
});
test('conta usa todos os benefícios gratuitamente e mantém saldo e propriedade dos designs', async (t) => {
  const { app, json } = await fixture(t);
  const request = await json('/api/auth/email/request', { email: 'livre@example.test' });
  const login = await json('/api/auth/email/verify', {
    email: 'livre@example.test',
    code: request.body.localCode,
  });
  assert.equal(login.status, 200);
  const cookie = login.cookie;
  assert.equal((await json('/api/profile/nick', { nick: 'Pessoa Livre' }, cookie)).status, 200);
  const before = (await json('/api/jogos/manifestacao/pontos', undefined, cookie)).body.balance;
  for (const [route, key] of [
    ['personagem', app.ctx.catalog[0].key],
    ['veiculo', 'tesla-roadster'],
    ['bandeira', 'brasil-premium'],
    ['passe', 'total'],
    ['pvp', 'pvp'],
    ['acesso', 'acesso'],
  ]) {
    const result = await json('/api/jogos/manifestacao/' + route, { key }, cookie);
    assert.equal(result.status, 200);
    assert.equal(result.body.pointsCost, 0);
    assert.equal(result.body.alreadyOwned, true);
  }
  assert.equal(
    (await json('/api/jogos/manifestacao/pontos', undefined, cookie)).body.balance,
    before,
  );
  assert.equal(
    (
      await json(
        '/api/jogos/manifestacao/visual',
        { character: 12, skin: app.ctx.catalog[0].key },
        cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await json('/api/jogos/manifestacao/visual', { design: 'alheio' }, cookie)).status,
    400,
  );
  assert.equal(app.ctx.state.pointsLedger.filter((entry) => entry.direction === 'debit').length, 0);
});
test('WebSocket real de visitante aceita personagem, skin, bandeira, Roadster, PvP e corrida sem ticket', async (t) => {
  const { app, base } = await fixture(t),
    messages = [];
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws');
  t.after(() => ws.terminate());
  ws.on('message', (data, binary) => {
    if (!binary) messages.push(JSON.parse(data));
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const wait = async (predicate) => {
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail('Evento WebSocket não recebido');
  };
  const skin = app.ctx.catalog.find((item) => item.key === 'super-xandao').key;
  ws.send(
    JSON.stringify({ t: 'join', nick: 'Visitante', character: 12, skin, appearance: 4 << 12 }),
  );
  await wait(() => messages.some((message) => message.t === 'welcome'));
  const player = [...app.ctx.players.values()][0];
  assert.equal(player.userId, undefined);
  assert.equal(player.character, 12);
  assert.equal(player.skin, skin);
  assert.equal(player.appearance, 4 << 12);
  ws.send(JSON.stringify({ t: 'vehicle', kind: 12 }));
  await wait(() => player.mode === 12);
  ws.send(JSON.stringify({ t: 'vehicle', kind: 0 }));
  await wait(() => player.mode === 0);
  ws.send(JSON.stringify({ t: 'pvp', on: true, weapon: 'fish' }));
  await wait(() => player.pvp?.on === true);
  assert.equal(player.pvp.weapon, 'fish');
  ws.send(JSON.stringify({ t: 'pvp', on: false }));
  await wait(() => player.pvp?.on === false);
  ws.send(JSON.stringify({ t: 'vehicle', kind: 1 }));
  await wait(() => player.mode === 1);
  ws.send(JSON.stringify({ t: 'race', action: 'join' }));
  await wait(() => app.ctx.race.rows.length === 1);
  assert.equal(app.ctx.race.rows[0].id, player.id);
  assert.equal(app.ctx.state.users.length, 0);
});
