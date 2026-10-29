import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { attachRealtime } from '../src/realtime.js';
import { initWorld } from '../src/world-actions.js';

async function fixture(t) {
  const server = createServer();
  const ctx = {
    state: {
      users: [
        {
          id: 'owned-test',
          nick: 'Teste',
          owned: { veiculos: ['tesla-roadster'], skins: ['modelo-local'] },
        },
      ],
      sessions: { ['a'.repeat(64)]: { userId: 'owned-test', expiresAt: Date.now() + 60000 } },
      world: {},
      designs: [],
      media: [],
    },
    catalog: { items: [{ key: 'modelo-local', baseCharacter: 0 }] },
    save() {},
    user() {
      return null;
    },
    dataDir: '/tmp',
  };
  const rt = attachRealtime(server, ctx);
  server.on('upgrade', (req, socket, head) =>
    rt.wss.handleUpgrade(req, socket, head, (ws) => rt.wss.emit('connection', ws, req)),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await rt.close();
    await new Promise((resolve) => server.close(resolve));
  });
  async function client(opts = {}) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`, {
        headers: opts.owned || opts.skin ? { cookie: `local_session=${'a'.repeat(64)}` } : {},
      }),
      messages = [];
    ws.on('message', (data, binary) =>
      messages.push(binary ? Buffer.from(data) : JSON.parse(data.toString())),
    );
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.send(
      JSON.stringify({
        t: 'join',
        nick: 'Teste local',
        team: 0,
        character: 0,
        ...opts,
      }),
    );
    async function wait(predicate) {
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const found = messages.find(predicate);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('Mensagem esperada não chegou');
    }
    return {
      ws,
      messages,
      wait,
      send: (msg) => ws.send(JSON.stringify(msg)),
      welcome: await wait((m) => m.t === 'welcome'),
    };
  }
  return { ctx, rt, client };
}

test('join real em dois clientes entrega nomes, aparências e snapshots binários', async (t) => {
  const { client, rt } = await fixture(t),
    a = await client(),
    b = await client({ nick: 'Outra pessoa', team: 1 });
  assert.notEqual(a.welcome.id, b.welcome.id);
  assert.equal(a.welcome.inputBinary, true);
  assert.ok(Array.isArray(a.welcome.history));
  assert.ok(Array.isArray(a.welcome.vehicles));
  const names = await a.wait((m) => m.t === 'names' && m.people.length === 2);
  assert.equal(names.people[1].nick, 'Outra pessoa');
  const snapshot = await a.wait((m) => Buffer.isBuffer(m) && m[0] === 1 && m.readUInt16LE(5) === 2);
  assert.equal(snapshot.readUInt32LE(7), a.welcome.id);
  assert.equal(rt.stats().participants, 2);
});

test('chat local chega ao vizinho ao vivo, mas não entra no histórico de novos joins', async (t) => {
  const { client, ctx } = await fixture(t);
  const a = await client(),
    nearby = await client();
  Object.assign(ctx.players.get(a.welcome.id), { x: 0, z: 100 });
  Object.assign(ctx.players.get(nearby.welcome.id), { x: 1, z: 100 });
  a.send({ t: 'chat', text: 'somente perto', channel: 'local' });
  assert.equal(
    (await nearby.wait((m) => m.t === 'chat' && m.text === 'somente perto')).channel,
    'local',
  );
  a.send({ t: 'chat', text: 'mensagem global', channel: 'global' });
  await nearby.wait((m) => m.t === 'chat' && m.text === 'mensagem global');
  const distant = await client({ resume: { x: 0, z: -400, mode: 0 } });
  const rejoined = await client({ token: nearby.welcome.token });
  for (const c of [distant, rejoined]) {
    assert.ok(c.welcome.history.some((m) => m.text === 'mensagem global'));
    assert.ok(!c.welcome.history.some((m) => m.text === 'somente perto'));
  }
});

test('poses JSON, array e binárias compartilham orçamento e recebem correção', async (t) => {
  const { client, ctx } = await fixture(t),
    a = await client({ resume: { x: 0, z: 100, mode: 0 } });
  const p = ctx.players.get(a.welcome.id),
    start = p.x;
  for (let i = 0; i < 30; i++) {
    const x = start + 4 + i * 0.1;
    if (i % 3 === 0) a.send({ t: 'input', pose: { x, z: 100, yaw: 0, speed: 1 } });
    else if (i % 3 === 1) a.send({ t: 'input', p: [x, 100, 0, 1] });
    else {
      const packet = Buffer.alloc(29);
      packet[0] = 7;
      packet.writeFloatLE(x, 10);
      packet.writeFloatLE(100, 14);
      packet.writeInt16LE(100, 20);
      packet.writeInt16LE(-32768, 22);
      a.ws.send(packet);
    }
  }
  await a.wait((m) => m.t === 'trust_fix');
  assert.ok(Math.abs(p.x - start) < 1);
  const seq = p.inputSeq;
  a.send({ t: 'input', x: 1, z: 0, run: true, seq: seq + 1 });
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.ok(p.x > start, 'inputs legítimos continuam integrados pelo servidor');
});

test('correção de pose identifica o veículo que o cliente deve reconciliar', async (t) => {
  const { client, ctx } = await fixture(t),
    a = await client({ resume: { x: 0, z: 100, mode: 0 } });
  a.send({ t: 'vehicle', kind: 1 });
  await a.wait((m) => m.t === 'stats' && m.vehicles.some((v) => v.owner === a.welcome.id));
  const p = ctx.players.get(a.welcome.id);
  a.send({ t: 'input', pose: { x: p.x + 100, z: p.z, yaw: 0, speed: 16 } });
  const correction = await a.wait((m) => m.t === 'trust_fix');
  assert.equal(correction.v, p.vehicle);
  assert.notEqual(correction.v, p.mode);
});

test('inputs JSON e binários, chat, visual, veículo e espectador atualizam mundo compartilhado', async (t) => {
  const { client, ctx } = await fixture(t),
    a = await client(),
    b = await client();
  const player = ctx.players.get(a.welcome.id),
    start = player.x;
  a.send({ t: 'input', x: 1, z: 0, seq: 5 });
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.ok(player.x > start);
  const bin = Buffer.alloc(10);
  bin[0] = 7;
  bin.writeUInt32LE(10, 1);
  bin.writeInt16LE(32767, 7);
  bin[9] = 1;
  a.ws.send(bin);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(player.inputSeq, 10);
  assert.equal(player.input.run, true);
  a.send({ t: 'chat', text: 'Olá local', channel: 'global' });
  assert.equal((await b.wait((m) => m.t === 'chat')).text, 'Olá local');
  a.send({ t: 'style', shirt: 7, appearance: 123 });
  await b.wait(
    (m) => m.t === 'names' && m.people.some((p) => p.id === a.welcome.id && p.look[1] === 7),
  );
  a.send({ t: 'vehicle', kind: 1 });
  await a.wait((m) => m.t === 'stats' && m.vehicles.some((v) => v.owner === a.welcome.id));
  assert.ok(player.vehicle >= 100000);
  a.send({ t: 'spectate', on: true });
  await a.wait((m) => m.t === 'mode' && m.spectator === true);
  assert.equal(player.spectator, true);
});

test('reconexão recupera identidade e posição pelo token local', async (t) => {
  const { client, ctx } = await fixture(t),
    a = await client(),
    id = a.welcome.id;
  ctx.players.get(id).x = 12;
  const close = new Promise((resolve) => a.ws.once('close', resolve));
  a.ws.close();
  await close;
  const b = await client({ token: a.welcome.token });
  assert.equal(b.welcome.id, id);
  assert.equal(b.welcome.token, a.welcome.token);
  assert.equal(ctx.players.get(id).x, 12);
});

test('roadster anuncia estado rocket e aplica boost sem aceitar pose que sobrescreva a física', async (t) => {
  const { client, ctx, rt } = await fixture(t),
    a = await client({ owned: true }),
    b = await client();
  const p = ctx.players.get(a.welcome.id);
  a.send({ t: 'vehicle', kind: 12 });
  await a.wait((m) => m.t === 'stats' && m.vehicles.some((v) => v.kind === 12));
  a.send({ t: 'roadster', a: 'boost' });
  const update = await b.wait(
    (m) => m.t === 'roadsters' && m.items[0]?.rocket.boostUntil > Date.now(),
  );
  assert.equal(update.items[0].id, p.vehicle);
  assert.equal(update.items[0].kind, 12);
  assert.ok(Number.isFinite(update.items[0].rocket.alt));
  const x = p.x;
  a.send({
    t: 'input',
    x: 0,
    z: 0,
    seq: 77,
    p: [x + 4, p.z, 0, 0, 99, 0, Date.now() >>> 0],
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(p.inputSeq, 77);
  assert.ok(Math.abs(p.x - x) < 0.1);
  assert.ok(rt.stats().vehicles[0].rocket);
});

test('debate compartilha mesa, mantém participante sentado e limpa ao desconectar', async (t) => {
  const { client, ctx } = await fixture(t),
    a = await client(),
    b = await client();
  await a.wait((m) => m.t === 'cm_state');
  const p = ctx.players.get(a.welcome.id);
  p.x = -40;
  p.z = -28;
  a.send({
    t: 'cm',
    action: 'create',
    x: -40,
    z: -28,
    yaw: 0,
    topic: 'Encontro local',
  });
  const table = await b.wait((m) => m.t === 'cm_state' && m.sessions.length === 1);
  assert.equal(table.sessions[0].host.id, p.id);
  const x = p.x,
    z = p.z;
  a.send({
    t: 'input',
    x: 1,
    z: 1,
    run: true,
    seq: 4,
    p: [x + 3, z + 3, 0, 4, 99, 0, Date.now() >>> 0],
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(p.x, x);
  assert.equal(p.z, z);
  assert.equal(p.speed, 0);
  const close = new Promise((resolve) => a.ws.once('close', resolve));
  a.ws.close();
  await close;
  await b.wait((m) => m.t === 'cm_state' && m.at >= table.at && m.sessions.length === 0);
  assert.equal(ctx.debateSessions.size, 0);
});

test('trocar skin para personagem base remove modelo especial sem afetar estilos parciais', async (t) => {
  const { client, ctx } = await fixture(t),
    a = await client({ skin: 'modelo-local' });
  a.send({ t: 'style', shirt: 7 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ctx.players.get(a.welcome.id).skin, 'modelo-local');
  a.send({ t: 'style', character: 0, shirt: 0, appearance: 1 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ctx.players.get(a.welcome.id).skin, '');
});

test('modo espectador limpa PvP e anuncia consentimento desligado aos outros clientes', async (t) => {
  const { client, ctx } = await fixture(t),
    a = await client({ owned: true }),
    b = await client();
  const p = ctx.players.get(a.welcome.id);
  ctx.state.users[0].owned.pvpEnabled = true;
  a.send({ t: 'pvp', on: true });
  await a.wait((m) => m.t === 'pvp' && m.me.on === true);
  assert.equal(p.pvp.on, true);
  a.send({ t: 'spectate', on: true });
  await a.wait((m) => m.t === 'mode' && m.spectator === true);
  assert.equal(p.pvp.on, false);
  await b.wait(
    (m) =>
      m.t === 'physical_state' &&
      m.members.some((actor) => actor.id === p.id && actor.on === false),
  );
  a.send({ t: 'spectate', on: false });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(p.spectator, false);
  assert.equal(p.pvp.on, false);
});

test('chat_report registra somente mensagens efetivamente entregues e inclui histórico do welcome', async (t) => {
  const { ctx, client } = await fixture(t),
    a = await client(),
    b = await client();
  a.send({ t: 'chat', text: 'Evidência pública' });
  const chat = await b.wait((m) => m.t === 'chat' && m.text === 'Evidência pública');
  b.send({ t: 'chat_report', mid: chat.mid, text: 'conteúdo forjado', userId: 'admin' });
  await b.wait((m) => m.t === 'notice' && m.text.startsWith('Denúncia registrada'));
  assert.equal(ctx.state.reports.length, 1);
  assert.equal(ctx.state.reports[0].content.text, 'Evidência pública');
  const c = await client();
  c.send({ t: 'report', mid: chat.mid });
  await c.wait((m) => m.t === 'notice' && m.text.startsWith('Denúncia registrada'));
  assert.equal(ctx.state.reports.length, 2);
  c.send({ t: 'chat_report', mid: 'inventado' });
  await c.wait((m) => m.t === 'notice' && m.text.startsWith('Esta mensagem'));
  assert.equal(ctx.state.reports.length, 2);
});

test('menu report por jogador denuncia última mensagem recebida sem confiar em conteúdo do cliente', async (t) => {
  const { ctx, client } = await fixture(t),
    a = await client(),
    b = await client();
  a.send({ t: 'chat', text: 'Última mensagem do autor' });
  const chat = await b.wait((m) => m.t === 'chat' && m.text === 'Última mensagem do autor');
  b.send({ t: 'report', id: a.welcome.id, text: 'inventado', userId: 'admin' });
  await b.wait((m) => m.t === 'notice' && m.text.includes('última mensagem recente'));
  assert.equal(ctx.state.reports[0].content.mid, chat.mid);
  assert.equal(ctx.state.reports[0].content.playerId, a.welcome.id);
  assert.equal(ctx.state.reports[0].content.text, 'Última mensagem do autor');
  a.send({ t: 'report', id: b.welcome.id });
  await a.wait((m) => m.t === 'notice' && m.text.startsWith('Não há mensagem recente'));
  assert.equal(ctx.state.reports.length, 1);
});

test('erro transitório no tick não paralisa sala com armazenamento saudável', async (t) => {
  const { ctx, rt } = await fixture(t);
  let attempts = 0;
  const errors = [];
  ctx.log = (kind) => errors.push(kind);
  ctx.persistence = { health: () => ({ ok: true }) };
  ctx.beginSaveBatch = () => {
    if (++attempts === 1) throw new Error('Falha transitória simulada');
  };
  const before = rt.metrics().ticks;
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.ok(errors.includes('realtime-tick'));
  assert.ok(attempts >= 2);
  assert.ok(rt.metrics().ticks > before + 1);
  assert.equal(rt.metrics().storageStopped, false);
});

test('falha de armazenamento no tick interrompe sala e desconecta participantes', async (t) => {
  const { ctx, rt, client } = await fixture(t);
  const a = await client();
  const close = new Promise((resolve) => a.ws.once('close', (code) => resolve(code)));
  ctx.persistence = { health: () => ({ ok: false }) };
  assert.equal(await close, 1013);
  assert.equal(rt.metrics().storageStopped, true);
});

test('reconexão WebSocket preserva fichas efêmeras do visitante no acesso livre', async (t) => {
  const { client, ctx } = await fixture(t);
  ctx.freeAccess = true;
  const a = await client();
  initWorld(ctx.players.get(a.welcome.id), ctx).secretProgress.coins = 42;
  const close = new Promise((resolve) => a.ws.once('close', resolve));
  a.ws.close();
  await close;
  const b = await client({ token: a.welcome.token });
  assert.equal(b.welcome.id, a.welcome.id);
  assert.equal(b.welcome.secretProgress.coins, 42);
  assert.deepEqual(ctx.state.world.progress, {});
});

test('sair da mesa por teleporte ou palco móvel libera os comandos de movimento', async (t) => {
  const { client, ctx } = await fixture(t),
    a = await client(),
    b = await client();
  const p = ctx.players.get(a.welcome.id),
    truck = ctx.players.get(b.welcome.id);
  for (const action of ['unstuck', 'palanque_ir', 'deck']) {
    Object.assign(p, { x: -40, z: -28, mode: 0 });
    a.send({ t: 'cm', action: 'create', x: -40, z: -28, yaw: 0, topic: action });
    await a.wait((m) => m.t === 'cm_state' && m.sessions.some((s) => s.topic === action));
    if (action === 'deck') {
      Object.assign(truck, { x: p.x, z: p.z, mode: 6, vehicle: 123 });
      // Uma tentativa sem caminhão próximo deve preservar a cadeira.
      truck.x += 50;
      a.send({ t: 'deck', on: true });
      await a.wait((m) => m.t === 'notice' && /Aproxime-se do palco/.test(m.text));
      assert.equal(ctx.debateSessions.size, 1);
      truck.x = p.x;
    }
    a.send({ t: action, on: true });
    a.send({ t: 'input', x: 1, z: 0, seq: 20 });
    a.send({ t: 'ping', at: action });
    await a.wait((m) => m.t === 'pong' && m.at === action);
    assert.equal(ctx.debateSessions.size, 0, action);
    assert.equal(p.input.x, 1, action);
    if (action === 'deck') {
      assert.equal(p.mode, 32);
      assert.equal(p.stageDeck.owner, truck.id);
    }
  }
});

test('carona WS embarca, bloqueia pose do passageiro e sincroniza após input do motorista', async (t) => {
  const { client, ctx, rt } = await fixture(t);
  const driver = await client(),
    rider = await client(),
    third = await client();
  const d = ctx.players.get(driver.welcome.id),
    p = ctx.players.get(rider.welcome.id),
    extra = ctx.players.get(third.welcome.id);
  Object.assign(d, { x: 0, z: 100 });
  Object.assign(p, { x: 2, z: 100 });
  Object.assign(extra, { x: -2, z: 100 });
  driver.send({ t: 'vehicle', kind: 1 });
  await driver.wait((m) => m.t === 'stats' && m.vehicles.some((v) => v.driver === d.id));
  rider.send({ t: 'seat', on: true, id: d.vehicle });
  await rider.wait((m) => m.t === 'stats' && m.vehicles.some((v) => v.passenger === p.id));
  assert.equal(p.mode, 33);
  third.send({ t: 'seat', on: true, id: d.vehicle });
  await third.wait((m) => m.t === 'notice' && m.text.includes('Carro cheio'));
  rider.send({ t: 'input', x: 1, z: 1, pose: { x: 200, z: 200, yaw: 2, speed: 16 } });
  driver.send({ t: 'input', x: 0, z: 1 });
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.equal(p.x, d.x);
  assert.equal(p.z, d.z);
  assert.equal(p.yaw, d.yaw);
  assert.equal(p.speed, d.speed);
  assert.equal(rt.stats().vehicles.length, 1);
  const binary = [...rider.messages].reverse().find((m) => Buffer.isBuffer(m) && m[0] === 1);
  let record;
  for (let i = 0; i < binary.readUInt16LE(5); i++)
    if (binary.readUInt32LE(11 + i * 16) === p.id) record = 11 + i * 16;
  assert.equal(binary[record + 12], 33);
  assert.equal(binary.readUInt16LE(record + 14) + 99999, d.vehicle);
  rider.send({ t: 'seat', on: false });
  await rider.wait((m) => m.t === 'relocate');
  assert.equal(p.mode, 0);
  assert.equal(p.vehicle, 0);
});

test('carona WS libera passageiro ao desconectar, trocar veículo ou teleportar motorista', async (t) => {
  const { client, ctx } = await fixture(t);
  const driver = await client(),
    rider = await client();
  const d = ctx.players.get(driver.welcome.id),
    p = ctx.players.get(rider.welcome.id);
  const board = async () => {
    Object.assign(d, { x: 0, z: 100, input: { x: 0, z: 0 } });
    Object.assign(p, { x: 2, z: 100 });
    rider.messages.length = 0;
    rider.send({ t: 'seat', on: true, id: d.vehicle });
    await rider.wait((m) => m.t === 'stats' && m.vehicles.some((v) => v.passenger === p.id));
  };
  driver.send({ t: 'vehicle', kind: 1 });
  await driver.wait((m) => m.t === 'stats' && m.vehicles.some((v) => v.driver === d.id));
  await board();
  driver.send({ t: 'vehicle', kind: 1 });
  await rider.wait((m) => m.t === 'relocate');
  assert.equal(p.mode, 0);
  await board();
  driver.send({ t: 'unstuck' });
  await rider.wait((m) => m.t === 'relocate');
  assert.equal(p.mode, 0);
  await board();
  driver.ws.close();
  await rider.wait((m) => m.t === 'relocate');
  assert.equal(p.mode, 0);
  assert.equal(p.vehicleSeat, undefined);
});

test('carona WS libera passageiro em palanque, espectador e reconexão sem recriar assento', async (t) => {
  const { client, ctx } = await fixture(t);
  const driver = await client(),
    rider = await client();
  const d = ctx.players.get(driver.welcome.id),
    p = ctx.players.get(rider.welcome.id);
  driver.send({ t: 'vehicle', kind: 1 });
  await driver.wait((m) => m.t === 'stats' && m.vehicles.some((v) => v.driver === d.id));
  async function board() {
    Object.assign(d, { x: 0, z: 100 });
    Object.assign(p, { x: 2, z: 100 });
    rider.messages.length = 0;
    rider.send({ t: 'seat', on: true, id: d.vehicle });
    await rider.wait((m) => m.t === 'stats' && m.vehicles.some((v) => v.passenger === p.id));
  }
  await board();
  rider.send({ t: 'palanque_ir' });
  await rider.wait((m) => m.t === 'relocate' && m.z === -43.5);
  assert.equal(p.mode, 0);
  assert.equal(p.vehicleSeat, undefined);
  await board();
  rider.send({ t: 'spectate', on: true });
  await rider.wait((m) => m.t === 'mode' && m.spectator);
  assert.equal(p.vehicleSeat, undefined);
  rider.send({ t: 'spectate', on: false });
  await rider.wait((m) => m.t === 'mode' && !m.spectator);
  await board();
  const resumed = await client({ token: rider.welcome.token });
  const restored = ctx.players.get(resumed.welcome.id);
  assert.equal(restored.mode, 0);
  assert.equal(restored.vehicle, 0);
  assert.equal(restored.vehicleSeat, undefined);
});
