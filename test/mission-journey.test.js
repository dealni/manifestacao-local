import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalServer } from '../src/server.js';
import { initWorld, handleWorldMessage } from '../src/world-actions.js';
import { FLAG_KEYS } from '../src/economy.js';
import { playerEntitlements } from '../src/game-permissions.js';
import { initializeWallet, debitPoints } from '../src/points.js';

const { missions } = JSON.parse(
  fs.readFileSync(new URL('../src/world-data.json', import.meta.url), 'utf8'),
);
const prefix = '/api/jogos/manifestacao';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);

test('jornada das 11 missões persiste recompensas e designs gratuitos em HTTP sem saldo', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-mission-journey-'));
  let app, base;
  const token = 'a'.repeat(64);
  const player = {
    id: 1,
    userId: 'journey',
    authSessionToken: token,
    ws: { readyState: 3 },
    x: 200,
    z: 200,
    team: 0,
  };
  async function start() {
    app = await createLocalServer({ freeAccess: false, dataDir, port: 0 });
    const address = await app.listen();
    base = `http://127.0.0.1:${address.port}`;
    initWorld(player, app.ctx);
  }
  t.after(async () => {
    await app?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  async function request(route, body) {
    const binary = Buffer.isBuffer(body);
    const response = await fetch(base + prefix + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Cookie: `local_session=${token}`,
        ...(binary ? { 'Content-Type': 'image/png' } : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: binary ? body : JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  }
  await start();
  const user = { id: 'journey', nick: 'Jornada QA', verified: true, nickPending: false };
  app.ctx.state.users.push(user);
  app.ctx.state.sessions[token] = { userId: user.id, expiresAt: Date.now() + 3600000 };
  initializeWallet(app.ctx.state, user);
  assert.equal(
    debitPoints(app.ctx.state, user, {
      amount: user.pointsWallet.balance,
      reason: 'fixture',
      reference: 'journey-zero-balance',
    }).ok,
    true,
  );
  app.ctx.save();
  const ledgerBefore = structuredClone(app.ctx.state.pointsLedger);
  const beforeReward = await request('/cartaz?tipo=cartaz', png);
  assert.equal(beforeReward.design.paid, false);
  assert.equal(beforeReward.design.points, 100);
  assert.equal((await request('/conta')).media.designPoints, 100);

  for (let index = 0; index < missions.length; index++) {
    const mission = app.ctx.state.world.progress.journey.mission;
    assert.equal(mission.index, index);
    // Fixture explícita dos contadores canônicos: o teste não simula tempo real,
    // percurso, corrida ou colisões; esses produtores têm testes próprios.
    const definition = missions[index];
    const goals = { activeMs: definition.minutes * 60000, ...definition.goals };
    for (const [key, target] of Object.entries(goals)) {
      const counter = key === 'travel' ? 'walk' : key;
      mission.counts[counter] = Math.max(mission.counts[counter] ?? 0, target);
    }
    assert.equal(handleWorldMessage(player, { t: 'missions' }, app.ctx), true);
    assert.equal(
      mission.index,
      index + 1,
      JSON.stringify({ id: definition.id, counts: mission.counts, goals }),
    );
    assert.equal(mission.completed.at(-1).id, definition.id);
    assert.equal(new Set(mission.completed.map((entry) => entry.id)).size, index + 1);
    const account = await request('/conta');
    assert.equal(account.wallet.balance, 0);
    const rights = playerEntitlements(player, app.ctx);
    assert.deepEqual(account.user.veiculos, rights.veiculos);
    assert.deepEqual(account.user.bandeiras, rights.bandeiras);
    assert.deepEqual(account.user.pvpItems, rights.objetos);
    if (definition.reward === 'flags-basic') {
      assert.ok(account.user.bandeiras.includes('brasil-premium'));
      assert.ok(account.user.bandeiras.includes('pt-premium'));
    }
    if (definition.reward === 'designs') {
      assert.equal(account.user.designsFree, true);
      assert.equal(account.media.designPoints, 0);
      await app.close();
      await start();
      assert.equal(app.ctx.state.world.progress.journey.mission.index, index + 1);
      assert.equal((await request('/conta')).user.designsFree, true);
    }
  }
  const legacy = await request('/cartaz/comprar', { id: beforeReward.design.id });
  assert.equal(legacy.free, true);
  assert.equal(legacy.points, 0);
  for (const kind of ['cartaz', 'bandeira']) {
    const uploaded = await request(`/cartaz?tipo=${kind}`, png);
    assert.equal(uploaded.design.paid, true);
    assert.equal(uploaded.design.free, true);
    assert.equal(uploaded.design.points, 0);
    for (const route of ['/cartaz/comprar', '/cartaz/ativar', '/cartaz/ativar']) {
      const activated = await request(route, { id: uploaded.design.id });
      assert.equal(activated.points, 0);
      assert.equal(activated.free, true);
      assert.equal(activated.account.wallet.balance, 0);
    }
  }
  await app.close();
  await start();
  const account = await request('/conta');
  assert.equal(app.ctx.state.world.progress.journey.mission.index, 11);
  assert.equal(app.ctx.state.world.progress.journey.mission.completed.length, 11);
  assert.ok(FLAG_KEYS.every((flag) => account.user.bandeiras.includes(flag)));
  for (const vehicle of ['moto', 'chopper', 'carreta', 'caixa', 'carro-som', 'caminhao-som'])
    assert.ok(account.user.veiculos.includes(vehicle));
  for (const object of ['pillow', 'foam']) assert.ok(account.user.pvpItems.includes(object));
  assert.equal(account.user.designsFree, true);
  assert.equal(account.wallet.balance, 0);
  assert.equal(account.user.cartazes.length, 3);
  assert.deepEqual(
    app.ctx.state.pointsLedger,
    ledgerBefore,
    'nenhum prêmio ou design deve criar débito/crédito',
  );
  const owned = structuredClone(app.ctx.state.users[0].owned);
  handleWorldMessage(player, { t: 'missions' }, app.ctx);
  handleWorldMessage(player, { t: 'missions' }, app.ctx);
  assert.deepEqual(
    app.ctx.state.users[0].owned,
    owned,
    'consultas repetidas não duplicam recompensas',
  );
});
