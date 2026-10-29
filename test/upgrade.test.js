import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { handleLocalUpgrade } from '../src/upgrade.js';

test('upgrade inválido fecha somente a conexão e preserva HTTP e WebSockets', async (t) => {
  const realtime = { wss: new WebSocketServer({ noServer: true }) };
  for (const [name, service] of Object.entries({ realtime })) {
    service.wss.on('connection', (ws) => ws.send(name));
  }
  const server = http.createServer((req, res) => res.end('saudável'));
  const localHost = (host) => /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host ?? '');
  server.on('upgrade', (req, socket, head) =>
    handleLocalUpgrade(req, socket, head, { realtime, localHost }),
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    for (const service of [realtime]) {
      for (const client of service.wss.clients) client.terminate();
      service.wss.close();
    }
    await new Promise((resolve) => server.close(resolve));
  });
  const port = server.address().port;
  const host = `127.0.0.1:${port}`;
  async function rawUpgrade(target, extra = '') {
    const socket = net.connect(port, '127.0.0.1');
    socket.on('error', () => {});
    socket.setTimeout(2000, () => socket.destroy(new Error('Handshake não encerrado.')));
    await once(socket, 'connect');
    const closed = once(socket, 'close');
    socket.write(
      `GET ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n${extra}\r\n`,
    );
    socket.resume();
    await closed;
    assert.equal(await (await fetch(`http://${host}/health`)).text(), 'saudável');
  }
  await rawUpgrade('http://[');
  await rawUpgrade('/ws', 'Origin: http://[\r\n');
  await rawUpgrade('/ws', 'Origin: http://example.invalid\r\n');
  await rawUpgrade('/ws', `Origin: http://${host}/other-path\r\n`);
  await rawUpgrade('/ws', `Origin: http://${host}/\r\n`);
  await rawUpgrade('/ws#');
  await rawUpgrade('http://example.invalid/ws');
  await rawUpgrade('/inexistente');
  await rawUpgrade('/local-voice');
  for (const [route, expected] of [['/ws', 'realtime']]) {
    const ws = new WebSocket(`ws://${host}${route}`, { origin: `http://${host}` });
    const message = once(ws, 'message');
    assert.equal((await message)[0].toString(), expected);
    const closed = once(ws, 'close');
    ws.close();
    await closed;
  }
});
