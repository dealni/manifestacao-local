import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { attachRealtime } from '../src/realtime.js';
import { handleWorldMessage } from '../src/world-actions.js';
import {
  handleStageVoicePacket,
  stageVoiceSource,
  stageVoiceState,
  stageVoicePersonal,
  setStageVoiceWanted,
  setStageVoiceMonitor,
  stopStageVoice,
  handleStageDeck,
  tickStageDecks,
  refreshStageVoice,
  STAGE_VOICE_TIMEOUT,
} from '../src/stage-voice.js';
function packet(seq = 1, size = 8) {
  const b = Buffer.alloc(3 + size, 0x78);
  b[0] = 4;
  b.writeUInt16LE(seq, 1);
  return b;
}
function fixture() {
  const sent = [],
    broadcast = [];
  const ctx = {
    players: new Map(),
    state: { world: {}, users: [] },
    save() {},
    sendPlayer(p, m) {
      sent.push([p.id, m]);
    },
    broadcast(m) {
      broadcast.push(m);
    },
  };
  const player = (id, x = -18.2, z = -43.5) => {
    const p = { id, nick: `Pessoa ${id}`, team: 0, x, z, yaw: 0, mode: 0, voiceWanted: true };
    ctx.players.set(id, p);
    return p;
  };
  const audio = (id) =>
    sent.filter(([pid, m]) => pid === id && Buffer.isBuffer(m)).map(([, m]) => m);
  return { ctx, sent, broadcast, player, audio };
}
test('palanques: geometria canônica independe de equipe, flags ou posição enviada', () => {
  const { ctx, player } = fixture(),
    p = player(1, 0, 0);
  p.onStage = true;
  assert.equal(stageVoiceSource(p, ctx), null);
  handleWorldMessage(p, { t: 'palanque_enter', on: true, stage: 0, x: -18.2, z: -43.5 }, ctx);
  assert.equal(stageVoicePersonal(p, ctx).may, false);
  Object.assign(p, { x: 18.2, z: -9, team: 0 });
  assert.equal(stageVoiceSource(p, ctx).stage, 2);
  for (const overrides of [
    { mode: 1 },
    { spectator: true },
    { secretRide: {} },
    { raceFrozen: true },
  ]) {
    Object.assign(p, { mode: 0, spectator: false, secretRide: null, raceFrozen: false }, overrides);
    assert.equal(stageVoiceSource(p, ctx), null);
  }
});
test('Opus: um orador global, raio60, opt-in, sequência e retorno ao livre', () => {
  const f = fixture(),
    a = f.player(1),
    b = f.player(2),
    muted = f.player(5);
  f.player(3, -17, -40);
  f.player(4, -18, 20);
  muted.voiceWanted = false;
  const spectator = f.player(6);
  spectator.spectator = true;
  assert.equal(handleStageVoicePacket(a, packet(), f.ctx, 1000), true);
  assert.equal(f.audio(3).length, 1);
  assert.equal(f.audio(4).length, 0);
  assert.equal(f.audio(5).length, 0);
  assert.equal(f.audio(6).length, 0);
  assert.equal(f.audio(1).length, 0);
  const received = f.audio(3)[0];
  assert.equal(received[0], 4);
  assert.equal(received[1], 1);
  assert.equal(received[2], 0);
  assert.equal(received.readUInt32LE(3), 1);
  assert.equal(received.readUInt16LE(7), 1);
  assert.equal(received.readUInt16LE(9), 8);
  assert.deepEqual(received.subarray(11), packet().subarray(3));
  handleStageVoicePacket(b, packet(), f.ctx, 1010);
  assert.equal(f.audio(3).length, 1);
  assert.equal(stageVoicePersonal(b, f.ctx, 1010).busy, true);
  handleStageVoicePacket(a, packet(), f.ctx, 1020);
  assert.equal(f.audio(3).length, 1);
  handleStageVoicePacket(a, packet(0), f.ctx, 1030);
  assert.equal(f.audio(3).length, 1);
  handleStageVoicePacket(b, packet(2), f.ctx, 1000 + STAGE_VOICE_TIMEOUT + 1);
  assert.equal(f.audio(3).length, 2);
  assert.equal(stageVoiceState(f.ctx, 2201).live[0].id, 2);
  setStageVoiceWanted(b, false, f.ctx);
  assert.equal(stageVoiceState(f.ctx).live.length, 0);
});
test('Opus: tamanhos, taxa, backpressure e remoção imediata de orador inelegível', () => {
  const f = fixture(),
    a = f.player(1),
    b = f.player(2);
  handleStageVoicePacket(a, packet(1, 1276), f.ctx, 1000);
  assert.equal(f.audio(2).length, 0);
  handleStageVoicePacket(a, Buffer.from([4, 0, 0]), f.ctx, 1000);
  assert.equal(f.audio(2).length, 0);
  for (let n = 1; n <= 80; n++) handleStageVoicePacket(a, packet(n), f.ctx, 1000 + n);
  assert.equal(f.audio(2).length, 60);
  b.ws = { bufferedAmount: 129 * 1024 };
  handleStageVoicePacket(a, packet(81), f.ctx, 2100);
  assert.equal(f.audio(2).length, 60);
  a.spectator = true;
  refreshStageVoice(f.ctx, 2101);
  assert.equal(stageVoiceState(f.ctx, 2101).live.length, 0);
});
test('palco móvel: embarque perto, posição servidor acompanha caminhão e saída libera', () => {
  const f = fixture(),
    driver = f.player(1, 80, 100),
    rider = f.player(2, 82, 100),
    far = f.player(4, 0, 0);
  f.player(3, 82, 105);
  Object.assign(driver, { mode: 6, vehicle: 100001 });
  handleStageDeck(far, true, f.ctx);
  assert.equal(far.mode, 0);
  assert.equal(far.stageDeck, undefined);
  handleStageDeck(rider, true, f.ctx);
  assert.equal(rider.mode, 32);
  assert.equal(stageVoiceSource(rider, f.ctx).stage, 3);
  handleStageVoicePacket(rider, packet(), f.ctx, 1000);
  assert.equal(f.audio(3).length, 1);
  assert.equal(f.audio(3)[0][2], 48);
  driver.x = 100;
  driver.yaw = Math.PI / 2;
  tickStageDecks(f.ctx, 0.05);
  assert.ok(Math.abs(rider.x - 99) < 1e-8);
  assert.ok(Math.abs(rider.z - 100) < 1e-8);
  assert.equal(stageVoiceState(f.ctx, 1001).live[0].truck, 100001);
  rider.input = { x: 1, z: 1 };
  for (let i = 0; i < 100; i++) tickStageDecks(f.ctx, 0.1);
  assert.ok(stageVoiceSource(rider, f.ctx));
  handleStageDeck(rider, false, f.ctx);
  assert.equal(rider.mode, 0);
  assert.equal(stageVoiceSource(rider, f.ctx), null);
  assert.equal(stageVoiceState(f.ctx).live.length, 0);
});
test('palco móvel: não confia em deck forjado e encerra quando caminhão desaparece', () => {
  const f = fixture(),
    driver = f.player(1, 80, 100),
    rider = f.player(2, 82, 100);
  Object.assign(driver, { mode: 6, vehicle: 100001 });
  handleStageDeck(rider, true, f.ctx);
  rider.x += 30;
  assert.equal(stageVoiceSource(rider, f.ctx), null);
  tickStageDecks(f.ctx, 0.05);
  handleStageVoicePacket(rider, packet(), f.ctx, 1000);
  f.ctx.players.delete(driver.id);
  tickStageDecks(f.ctx, 0.05);
  assert.equal(rider.mode, 0);
  assert.equal(stageVoiceState(f.ctx).live.length, 0);
});
async function socketFixture(t) {
  const server = createServer(),
    ctx = {
      state: { users: [], sessions: {}, world: {}, designs: [], media: [] },
      catalog: { items: [] },
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
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await rt.close();
    await new Promise((r) => server.close(r));
  });
  async function client(x = -18.2, z = -43.5) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`),
      messages = [];
    ws.on('message', (data, binary) =>
      messages.push(binary ? Buffer.from(data) : JSON.parse(data)),
    );
    await new Promise((r, j) => {
      ws.once('open', r);
      ws.once('error', j);
    });
    ws.send(JSON.stringify({ t: 'join', nick: 'Teste', team: 0 }));
    const wait = async (fn) => {
      const end = Date.now() + 2000;
      while (Date.now() < end) {
        const got = messages.find(fn);
        if (got) return got;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw Error('Mensagem não chegou');
    };
    const welcome = await wait((m) => m.t === 'welcome');
    const p = ctx.players.get(welcome.id);
    Object.assign(p, { x, z });
    ws.send(JSON.stringify({ t: 'voz', on: true }));
    await wait((m) => m.t === 'palanque_eu' && m.may === !!stageVoiceSource(p, ctx));
    return { ws, messages, wait, p };
  }
  return { ctx, client };
}
test('WebSocket real: relay binário só a vizinhos opt-in, bloqueia disputa, remoto e desligamento', async (t) => {
  const { ctx, client } = await socketFixture(t),
    a = await client(),
    b = await client(-17, -40),
    far = await client(120, 100),
    competitor = await client(18.2, -43);
  a.ws.send(packet(1));
  await b.wait((m) => Buffer.isBuffer(m) && m[0] === 4);
  assert.equal(
    far.messages.some((m) => Buffer.isBuffer(m) && m[0] === 4),
    false,
  );
  competitor.ws.send(packet(1));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(b.messages.filter((m) => Buffer.isBuffer(m) && m[0] === 4).length, 1);
  far.ws.send(JSON.stringify({ t: 'palanque_enter', on: true, stage: 0 }));
  far.ws.send(packet(1));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(b.messages.filter((m) => Buffer.isBuffer(m) && m[0] === 4).length, 1);
  a.ws.send(JSON.stringify({ t: 'voz', on: false }));
  await competitor.wait((m) => m.t === 'palanque' && m.live.length === 0);
  competitor.ws.send(packet(2));
  await b.wait((m) => Buffer.isBuffer(m) && m[0] === 4 && m.readUInt32LE(3) === competitor.p.id);
  const closeStart = b.messages.length;
  competitor.ws.close();
  await b.wait(
    (m) => b.messages.indexOf(m) >= closeStart && m.t === 'palanque' && m.live.length === 0,
  );
  assert.equal(stageVoiceState(ctx).live.length, 0);
});
test('sequência aceita volta U16; reinício de escuta não herda bloqueio de sequência', () => {
  const f = fixture(),
    a = f.player(1),
    b = f.player(2);
  for (const seq of [65534, 65535, 0, 1]) handleStageVoicePacket(a, packet(seq), f.ctx, Date.now());
  assert.equal(f.audio(b.id).length, 4);
  setStageVoiceWanted(a, false, f.ctx);
  setStageVoiceWanted(a, true, f.ctx);
  handleStageVoicePacket(a, packet(0), f.ctx, Date.now());
  assert.equal(f.audio(b.id).length, 5);
  handleWorldMessage(a, { t: 'palanque_stop' }, f.ctx);
  assert.equal(stageVoiceState(f.ctx).live.length, 0);
  assert.equal(a.voiceWanted, true);
});
test('WebSocket real: palco móvel acompanha carro, espectador perde fala e cliente não forja posição', async (t) => {
  const { ctx, client } = await socketFixture(t),
    driver = await client(80, 100),
    rider = await client(82, 100),
    listener = await client(83, 105);
  Object.assign(driver.p, { mode: 6, vehicle: 100001 });
  rider.ws.send(JSON.stringify({ t: 'deck', on: true }));
  await rider.wait((m) => m.t === 'palanque_eu' && m.stage === 3 && m.may);
  assert.equal(rider.p.mode, 32);
  rider.ws.send(packet(1));
  await listener.wait((m) => Buffer.isBuffer(m) && m[0] === 4 && m[2] === 48);
  const count = listener.messages.filter((m) => Buffer.isBuffer(m) && m[0] === 4).length;
  rider.ws.send(
    JSON.stringify({ t: 'input', x: 0, z: 0, pose: { x: 200, z: 500, yaw: 0, speed: 0 } }),
  );
  await new Promise((r) => setTimeout(r, 65));
  assert.ok(Math.hypot(rider.p.x - driver.p.x, rider.p.z - driver.p.z) < 8);
  rider.ws.send(JSON.stringify({ t: 'spectate', on: true }));
  await rider.wait((m) => m.t === 'mode' && m.spectator === true);
  rider.ws.send(packet(2));
  await new Promise((r) => setTimeout(r, 65));
  assert.equal(listener.messages.filter((m) => Buffer.isBuffer(m) && m[0] === 4).length, count);
  assert.equal(stageVoiceState(ctx).live.length, 0);
});

test('monitor do palco exige opt-in e devolve o mesmo Opus do servidor apenas ao próprio orador', () => {
  const f = fixture(),
    speaker = f.player(1),
    near = f.player(2, -17, -40);
  f.player(3, 0, 100);
  let activity = 0;
  f.ctx.markPlayerActive = () => activity++;
  handleStageVoicePacket(speaker, packet(1), f.ctx, 1000);
  assert.equal(f.audio(1).length, 0);
  assert.equal(
    handleWorldMessage(speaker, { t: 'palanque_monitor', on: true, target: 2 }, f.ctx),
    true,
  );
  assert.equal(speaker.voiceMonitor, true);
  assert.equal(near.voiceMonitor, undefined);
  handleStageVoicePacket(speaker, packet(2), f.ctx, 1010);
  assert.equal(f.audio(1).length, 1);
  assert.deepEqual(f.audio(1)[0], f.audio(2).at(-1));
  assert.equal(f.audio(3).length, 0);
  assert.equal(activity, 2);
  handleStageVoicePacket(speaker, packet(2), f.ctx, 1011);
  assert.equal(f.audio(1).length, 1);
  setStageVoiceMonitor(speaker, false, f.ctx);
  handleStageVoicePacket(speaker, packet(3), f.ctx, 1020);
  assert.equal(f.audio(1).length, 1);
  setStageVoiceMonitor(speaker, true, f.ctx);
  stopStageVoice(speaker, f.ctx);
  assert.equal(speaker.voiceMonitor, false);
  setStageVoiceMonitor(speaker, true, f.ctx);
  setStageVoiceWanted(speaker, false, f.ctx);
  assert.equal(speaker.voiceMonitor, false);
});
test('monitor não concede fala remota, a espectador, a socket antigo nem disputa de palco', () => {
  const f = fixture(),
    speaker = f.player(1),
    remote = f.player(2, 0, 100),
    competitor = f.player(3);
  setStageVoiceMonitor(remote, true, f.ctx);
  assert.equal(remote.voiceMonitor, false);
  remote.x = -18.2;
  remote.z = -43.5;
  remote.spectator = true;
  setStageVoiceMonitor(remote, true, f.ctx);
  assert.equal(remote.voiceMonitor, false);
  const stale = { ...speaker };
  setStageVoiceMonitor(stale, true, f.ctx);
  assert.equal(stale.voiceMonitor, false);
  handleStageVoicePacket(speaker, packet(), f.ctx, Date.now());
  setStageVoiceMonitor(competitor, true, f.ctx);
  assert.equal(competitor.voiceMonitor, false);
  handleStageVoicePacket(competitor, packet(), f.ctx, Date.now());
  assert.equal(f.audio(3).length, 1); // Só recebeu o orador autorizado.
  assert.equal(stageVoiceState(f.ctx).live[0].id, speaker.id);
});
test('monitor do palco móvel segue autorização do caminhão e aplica backpressure ao próprio retorno', () => {
  const f = fixture(),
    driver = f.player(1, 80, 100),
    speaker = f.player(2, 82, 100);
  f.player(3, 82, 105);
  Object.assign(driver, { mode: 6, vehicle: 100001 });
  handleStageDeck(speaker, true, f.ctx);
  setStageVoiceMonitor(speaker, true, f.ctx);
  assert.equal(speaker.voiceMonitor, true);
  handleStageVoicePacket(speaker, packet(), f.ctx, 1000);
  assert.equal(f.audio(2)[0][2], 48);
  assert.deepEqual(f.audio(2)[0], f.audio(3)[0]);
  speaker.ws = { bufferedAmount: 129 * 1024 };
  handleStageVoicePacket(speaker, packet(2), f.ctx, 1010);
  assert.equal(f.audio(2).length, 1);
  assert.equal(f.audio(3).length, 2);
  f.ctx.players.delete(driver.id);
  refreshStageVoice(f.ctx, 1011);
  assert.equal(speaker.voiceMonitor, false);
});
test('WebSocket real: botão de retorno ativa e desativa eco do relay sem mudar audiência', async (t) => {
  const { client } = await socketFixture(t),
    speaker = await client(),
    listener = await client(-17, -40);
  speaker.ws.send(packet(1));
  await listener.wait((m) => Buffer.isBuffer(m) && m[0] === 4 && m.readUInt16LE(7) === 1);
  assert.equal(
    speaker.messages.some((m) => Buffer.isBuffer(m) && m[0] === 4),
    false,
  );
  speaker.ws.send(JSON.stringify({ t: 'palanque_monitor', on: true }));
  await speaker.wait((m) => m.t === 'palanque_monitor' && m.on === true);
  speaker.ws.send(packet(2));
  const returned = await speaker.wait(
    (m) => Buffer.isBuffer(m) && m[0] === 4 && m.readUInt16LE(7) === 2,
  );
  const publicAudio = await listener.wait(
    (m) => Buffer.isBuffer(m) && m[0] === 4 && m.readUInt16LE(7) === 2,
  );
  assert.deepEqual(returned, publicAudio);
  speaker.ws.send(JSON.stringify({ t: 'palanque_monitor', on: false }));
  await speaker.wait((m) => m.t === 'palanque_monitor' && m.on === false);
  speaker.ws.send(packet(3));
  await listener.wait((m) => Buffer.isBuffer(m) && m[0] === 4 && m.readUInt16LE(7) === 3);
  assert.equal(
    speaker.messages.some((m) => Buffer.isBuffer(m) && m[0] === 4 && m.readUInt16LE(7) === 3),
    false,
  );
});

test('pausa de rede invalida retorno com confirmação explícita e permite reativar após retomada', () => {
  const f = fixture(),
    speaker = f.player(1),
    near = f.player(2, -17, -40),
    base = Date.now(),
    acks = [];
  const original = f.ctx.sendPlayer;
  f.ctx.sendPlayer = (p, message) => {
    if (p === speaker && message.t === 'palanque_monitor') acks.push(message.on);
    original(p, message);
  };
  handleStageVoicePacket(speaker, packet(1), f.ctx, base);
  setStageVoiceMonitor(speaker, true, f.ctx);
  refreshStageVoice(f.ctx, base + 1300);
  assert.equal(speaker.voiceMonitor, false);
  assert.deepEqual(acks, [true, false]);
  handleStageVoicePacket(speaker, packet(2), f.ctx, base + 1310);
  assert.equal(f.audio(speaker.id).length, 0);
  assert.equal(f.audio(near.id).length, 2);
  setStageVoiceMonitor(speaker, true, f.ctx);
  handleStageVoicePacket(speaker, packet(3), f.ctx, base + 1320);
  assert.equal(f.audio(speaker.id).length, 1);
  assert.deepEqual(acks, [true, false, true]);
});

test('embarque e desembarque reiniciam baseline de atividade sem premiar teleporte', () => {
  const f = fixture(),
    driver = f.player(1, 80, 100),
    rider = f.player(2, 86, 100);
  Object.assign(driver, { mode: 6, vehicle: 100001 });
  rider.worldPrevious = { x: 86, z: 100, at: 1 };
  handleStageDeck(rider, true, f.ctx);
  assert.equal(rider.mode, 32);
  assert.deepEqual(
    { x: rider.worldPrevious.x, z: rider.worldPrevious.z },
    { x: rider.x, z: rider.z },
  );
  assert.ok(rider.worldPrevious.at > 1);
  const boarding = rider.worldPrevious;
  handleStageDeck(rider, false, f.ctx);
  assert.equal(rider.mode, 0);
  assert.notEqual(rider.worldPrevious, boarding);
  assert.deepEqual(
    { x: rider.worldPrevious.x, z: rider.worldPrevious.z },
    { x: rider.x, z: rider.z },
  );
});

test('palco móvel mantém fala entre pose do motorista e tick do passageiro, com origem atual', () => {
  const f = fixture(),
    driver = f.player(1, 80, 100),
    rider = f.player(2, 82, 100),
    listener = f.player(3, 80, 159),
    base = Date.now();
  Object.assign(driver, { mode: 6, vehicle: 100001 });
  handleStageDeck(rider, true, f.ctx);
  handleStageVoicePacket(rider, packet(1), f.ctx, base);
  setStageVoiceMonitor(rider, true, f.ctx);
  assert.equal(rider.voiceMonitor, true);
  const before = { x: rider.x, z: rider.z };
  // A pose do motorista é aceita pelo WebSocket antes de atualizar os passageiros.
  driver.z += 2;
  driver.yaw = Math.PI / 2;
  const source = stageVoiceSource(rider, f.ctx);
  assert.equal(source.x, 79);
  assert.equal(source.z, 102);
  assert.deepEqual({ x: rider.x, z: rider.z }, before);
  handleStageVoicePacket(rider, packet(2), f.ctx, base + 20);
  assert.equal(rider.voiceMonitor, true);
  assert.equal(f.audio(rider.id).length, 1);
  assert.equal(f.audio(listener.id).length, 2);
  assert.equal(stageVoiceState(f.ctx, base + 20).live[0].z, 102);
  // A mudança válida do caminhão não permite forjar a pose do passageiro.
  rider.x += 10;
  assert.equal(stageVoiceSource(rider, f.ctx), null);
  refreshStageVoice(f.ctx, base + 21, true);
  assert.equal(rider.voiceMonitor, false);
  assert.equal(stageVoiceState(f.ctx, base + 21).live.length, 0);
});

test('escuta desligada de um participante não desliga o palco nem impede retorno após opt-in', () => {
  const f = fixture(),
    speaker = f.player(1),
    listener = f.player(2, -17, -40),
    base = Date.now();
  handleStageVoicePacket(speaker, packet(1), f.ctx, base);
  setStageVoiceWanted(listener, false, f.ctx);
  handleStageVoicePacket(speaker, packet(2), f.ctx, base + 40);
  assert.equal(f.audio(listener.id).length, 1);
  assert.equal(stageVoiceState(f.ctx, base + 40).off, false);
  assert.equal(stageVoiceState(f.ctx, base + 40).live[0].id, speaker.id);
  assert.equal(stageVoicePersonal(listener, f.ctx, base + 40).off, false);
  setStageVoiceWanted(listener, true, f.ctx);
  handleStageVoicePacket(speaker, packet(3), f.ctx, base + 80);
  assert.equal(f.audio(listener.id).length, 2);
  assert.equal(f.audio(listener.id).at(-1).readUInt16LE(7), 3);
});

test('orador em outro palanque libera a ocupação por expiração e permite assumir sem desligar escuta', () => {
  const f = fixture(),
    speaker = f.player(1),
    next = f.player(2, 18.2, -9),
    listener = f.player(3, 0, -20),
    base = Date.now();
  handleStageVoicePacket(speaker, packet(1), f.ctx, base);
  assert.equal(stageVoicePersonal(next, f.ctx, base).busy, true);
  handleStageVoicePacket(next, packet(1), f.ctx, base + 40);
  assert.equal(f.audio(listener.id).length, 1);
  refreshStageVoice(f.ctx, base + STAGE_VOICE_TIMEOUT + 1, true);
  const permission = stageVoicePersonal(next, f.ctx, base + STAGE_VOICE_TIMEOUT + 1);
  assert.equal(permission.off, false);
  assert.equal(permission.busy, false);
  assert.equal(permission.may, true);
  handleStageVoicePacket(next, packet(2), f.ctx, base + STAGE_VOICE_TIMEOUT + 40);
  assert.equal(f.audio(listener.id).length, 2);
  const received = f.audio(listener.id).at(-1);
  assert.equal(received[2], 2 << 4);
  assert.equal(received.readUInt32LE(3), next.id);
});
