import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import {
  createPresence,
  isPresenceAction,
  IDLE_TIMEOUT,
  IDLE_WARNING,
  HEARTBEAT_INTERVAL,
} from '../src/presence.js';
import { attachRealtime } from '../src/realtime.js';
import { handleStageVoicePacket } from '../src/stage-voice.js';

function fixture() {
  const events = [],
    player = {};
  const presence = createPresence({
    send: (p, m) => events.push(m),
    disconnect: (p, code, reason) => events.push({ code, reason }),
  });
  presence.join(player, 1000);
  return { presence, player, events };
}
test('presença avisa no último minuto e encerra em dez minutos com código1000', () => {
  const f = fixture();
  f.presence.tick(f.player, 1000 + IDLE_TIMEOUT - IDLE_WARNING - 1);
  assert.deepEqual(f.events, []);
  f.presence.tick(f.player, 1000 + IDLE_TIMEOUT - IDLE_WARNING);
  assert.deepEqual(f.events, [{ t: 'idle_warning', remaining: 60000 }]);
  f.presence.tick(f.player, 1000 + IDLE_TIMEOUT - 1);
  assert.equal(f.events.length, 1);
  f.presence.tick(f.player, 1000 + IDLE_TIMEOUT);
  f.presence.tick(f.player, 1000 + IDLE_TIMEOUT + 1);
  assert.equal(f.events.length, 2);
  assert.equal(f.events[1].code, 1000);
  assert.equal(HEARTBEAT_INTERVAL, 10000);
});
test('interação cancela aviso e reinicia janela; encerramento não é revivido', () => {
  const f = fixture(),
    at = 1000 + IDLE_TIMEOUT - IDLE_WARNING;
  f.presence.tick(f.player, at);
  f.presence.active(f.player, at + 1);
  assert.deepEqual(f.events.at(-1), { t: 'idle_warning', remaining: 0 });
  f.presence.tick(f.player, 1000 + IDLE_TIMEOUT);
  assert.equal(f.events.length, 2);
  f.presence.tick(f.player, at + 1 + IDLE_TIMEOUT);
  f.presence.active(f.player, at + 2 + IDLE_TIMEOUT);
  assert.equal(f.events.length, 3);
});
test('polling, pings, poses e inputzero não renovam presença; ações explícitas sim', () => {
  for (const msg of [
    { t: 'ping' },
    { t: 'input', x: 0, z: 0 },
    { t: 'input', pose: { x: 99, z: 99 } },
    { t: 'view' },
    { t: 'missions' },
    { t: 'cm', action: 'proximity' },
    { t: 'social', a: 'inbox' },
    { t: 'social', a: 'who' },
    { t: 'roadster', a: 'roll', roll: 0 },
    { t: 'truck' },
    { t: 'voz', on: true },
    { t: 'chat', text: ' ' },
  ])
    assert.equal(isPresenceAction(msg), false, JSON.stringify(msg));
  for (const msg of [
    { t: 'active' },
    { t: 'chat', text: 'Olá' },
    { t: 'emote', emote: 1 },
    { t: 'race', action: 'join' },
    { t: 'cm', action: 'request' },
    { t: 'social', a: 'dm' },
    { t: 'roadster', a: 'boost' },
  ])
    assert.equal(isPresenceAction(msg), true, JSON.stringify(msg));
});
test('somente áudio aceito do palco renova presença', () => {
  let count = 0;
  const p = { id: 1, x: -18.2, z: -43.5, mode: 0, voiceWanted: true };
  const ctx = {
    players: new Map([[1, p]]),
    markPlayerActive() {
      count++;
    },
  };
  const packet = Buffer.from([4, 1, 0, 120]);
  handleStageVoicePacket(p, packet, ctx, 1000);
  assert.equal(count, 1);
  handleStageVoicePacket(p, packet, ctx, 1001);
  assert.equal(count, 1);
  p.x = 100;
  packet.writeUInt16LE(2, 1);
  handleStageVoicePacket(p, packet, ctx, 1002);
  assert.equal(count, 1);
});

test('WS real ignora inputzero e pose automática, aceita Continuar e remove inativo', async (t) => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  const server = createServer(),
    ctx = { state: { users: [], world: {}, designs: [], media: [] }, save() {}, dataDir: '/tmp' };
  const rt = attachRealtime(server, ctx),
    sockets = [];
  server.on('upgrade', (req, socket, head) =>
    rt.wss.handleUpgrade(req, socket, head, (ws) => rt.wss.emit('connection', ws, req)),
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    Date.now = originalNow;
    for (const ws of sockets) ws.terminate();
    await rt.close();
    await new Promise((r) => server.close(r));
  });
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`),
    messages = [];
  sockets.push(ws);
  ws.on('message', (data, binary) => {
    if (!binary) messages.push(JSON.parse(data));
  });
  const until = async (predicate) => {
    for (let i = 0; i < 100; i++) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.fail('Evento esperado não chegou');
  };
  await once(ws, 'open');
  ws.send(JSON.stringify({ t: 'join', nick: 'Presença' }));
  await until(() => messages.some((m) => m.t === 'welcome'));
  now += IDLE_TIMEOUT - IDLE_WARNING;
  ws.send(JSON.stringify({ t: 'input', x: 0, z: 0, pose: { x: 0, z: 100, yaw: 0, speed: 0 } }));
  ws.send(JSON.stringify({ t: 'ping' }));
  await until(() => messages.some((m) => m.t === 'idle_warning' && m.remaining === 60000));
  ws.send(JSON.stringify({ t: 'active' }));
  await until(() => messages.some((m) => m.t === 'idle_warning' && m.remaining === 0));
  now += IDLE_TIMEOUT - 1;
  ws.send(JSON.stringify({ t: 'input', x: 0, z: 0 }));
  await until(() => messages.filter((m) => m.t === 'idle_warning' && m.remaining > 0).length === 2);
  assert.equal(rt.stats().online, 1);
  const closed = once(ws, 'close');
  now++;
  assert.equal((await closed)[0], 1000);
  await until(() => rt.stats().online === 0);
  assert.equal(ctx.players.size, 0);
});

test('heartbeat encerra conexão sem pong em até dois ciclos de dez segundos', async (t) => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  const server = createServer(),
    ctx = { state: { users: [], world: {}, designs: [], media: [] }, save() {}, dataDir: '/tmp' };
  const rt = attachRealtime(server, ctx);
  server.on('upgrade', (req, socket, head) =>
    rt.wss.handleUpgrade(req, socket, head, (ws) => rt.wss.emit('connection', ws, req)),
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`, { autoPong: false });
  t.after(async () => {
    Date.now = originalNow;
    ws.terminate();
    await rt.close();
    await new Promise((r) => server.close(r));
  });
  await once(ws, 'open');
  const ping = once(ws, 'ping');
  now += HEARTBEAT_INTERVAL;
  await ping;
  assert.equal(ws.readyState, WebSocket.OPEN);
  const closed = once(ws, 'close');
  now += HEARTBEAT_INTERVAL;
  assert.equal((await closed)[0], 1006);
  assert.equal(rt.stats().online, 0);
});
