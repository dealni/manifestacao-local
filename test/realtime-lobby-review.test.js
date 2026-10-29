import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { attachRealtime } from '../src/realtime.js';

const receive = (ws, type) =>
  new Promise((resolve) => {
    function listener(data, binary) {
      if (binary) return;
      const message = JSON.parse(data.toString());
      if (message.t !== type) return;
      ws.off('message', listener);
      resolve(message);
    }
    ws.on('message', listener);
  });

test(
  'inscrição repetida no lobby evita amplificação e mantém entrada na sala',
  { timeout: 3000 },
  async (t) => {
    const server = createServer();
    const ctx = {
      state: { users: [], sessions: {}, world: {}, designs: [], media: [] },
      save() {},
      dataDir: '/tmp',
    };
    const realtime = attachRealtime(server, ctx);
    server.on('upgrade', (req, socket, head) =>
      realtime.wss.handleUpgrade(req, socket, head, (ws) =>
        realtime.wss.emit('connection', ws, req),
      ),
    );
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
      await realtime.close();
      await new Promise((resolve) => server.close(resolve));
    });
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
    const messages = [];
    ws.on('message', (data, binary) => {
      if (!binary) messages.push(JSON.parse(data.toString()));
    });
    await once(ws, 'open');
    const pong = receive(ws, 'pong');
    for (let index = 0; index < 40; index++) ws.send(JSON.stringify({ t: 'lobby' }));
    ws.send(JSON.stringify({ t: 'ping', at: 'barreira' }));
    assert.equal((await pong).at, 'barreira');
    assert.equal(messages.filter((message) => message.t === 'stats').length, 1);
    assert.equal(realtime.stats().online, 0);
    assert.equal(ws.readyState, WebSocket.OPEN);

    const welcome = receive(ws, 'welcome');
    ws.send(JSON.stringify({ t: 'join', nick: 'Visitante' }));
    assert.equal((await welcome).role, 'player');
    assert.equal(realtime.stats().online, 1);
  },
);
