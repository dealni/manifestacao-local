import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { attachRealtime } from '../src/realtime.js';

async function fixture(t, config = {}) {
  const server = createServer();
  const ctx = {
    config,
    state: { users: [], world: {}, designs: [], media: [] },
    save() {},
    user() {
      return null;
    },
    dataDir: '/tmp',
  };
  const realtime = attachRealtime(server, ctx);
  server.on('upgrade', (req, socket, head) =>
    realtime.wss.handleUpgrade(req, socket, head, (ws) => realtime.wss.emit('connection', ws, req)),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await realtime.close();
    await new Promise((resolve) => server.close(resolve));
  });
  async function connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
    const messages = [];
    ws.on('message', (data, binary) => {
      if (!binary) messages.push(JSON.parse(data));
    });
    await once(ws, 'open');
    return { ws, messages };
  }
  async function join(options = {}) {
    const client = await connect();
    const welcome = new Promise((resolve) =>
      client.ws.on('message', (data, binary) => {
        if (!binary) {
          const msg = JSON.parse(data);
          if (msg.t === 'welcome') resolve(msg);
        }
      }),
    );
    client.ws.send(JSON.stringify({ t: 'join', nick: 'Teste', ...options }));
    return { ...client, welcome: await welcome };
  }
  return { realtime, ctx, connect, join };
}

const waitFor = async (predicate) => {
  for (let count = 0; count < 100; count++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('Condição não atingida');
};

test(
  'capacidade real limita sessões e espectadores; reconectar substitui vaga',
  { timeout: 3000 },
  async (t) => {
    const { realtime, connect, join } = await fixture(t, { maxPlayers: 1 });
    const first = await join();
    assert.equal(first.welcome.capacity, 1);
    const second = await connect();
    const rejected = once(second.ws, 'close');
    second.ws.send(JSON.stringify({ t: 'join', spectate: true }));
    assert.equal((await rejected)[0], 1013);
    assert.equal(realtime.stats().online, 1);
    const replaced = once(first.ws, 'close');
    const resumed = await join({ token: first.welcome.token });
    assert.equal((await replaced)[0], 4000);
    assert.equal(resumed.welcome.id, first.welcome.id);
    assert.equal(realtime.stats().online, 1);
    assert.equal(realtime.metrics().rejectedJoins, 1);
  },
);

test(
  'capacidade padrão é 1000 e sockets sem jogador também têm teto',
  { timeout: 3000 },
  async (t) => {
    const { realtime, connect } = await fixture(t, { wsMaxConnections: 1 });
    await connect();
    const second = await connect();
    // O evento close pode chegar imediatamente após open; o listener é instalado na mesma microtask.
    assert.equal((await once(second.ws, 'close'))[0], 1013);
    assert.equal(realtime.stats().capacity, 1000);
  },
);

test('flood de frames é encerrado sem derrubar a sala', { timeout: 3000 }, async (t) => {
  const { realtime, connect } = await fixture(t, { wsMessagesPerSecond: 3 });
  const client = await connect();
  const closed = once(client.ws, 'close');
  for (let i = 0; i < 8; i++) client.ws.send(JSON.stringify({ t: 'ping', at: i }));
  assert.equal((await closed)[0], 1008);
  assert.equal(realtime.metrics().rateLimited, 1);
});

test(
  'chat tem limite separado sem bloquear movimento ou outro jogador',
  { timeout: 3000 },
  async (t) => {
    const { realtime, join } = await fixture(t, { wsChatPer10Seconds: 2 });
    const first = await join();
    const second = await join();
    for (let i = 0; i < 4; i++) first.ws.send(JSON.stringify({ t: 'chat', text: `Mensagem ${i}` }));
    first.ws.send(JSON.stringify({ t: 'input', x: 1, seq: 17 }));
    second.ws.send(JSON.stringify({ t: 'chat', text: 'Outro jogador' }));
    await waitFor(
      () =>
        realtime.metrics().rateLimited === 2 &&
        first.messages.some((m) => m.t === 'chat' && m.text === 'Outro jogador'),
    );
    assert.equal(
      first.messages.filter((m) => m.t === 'chat' && m.text.startsWith('Mensagem')).length,
      2,
    );
    assert.equal(realtime.stats().online, 2);
    assert.equal(first.ws.readyState, WebSocket.OPEN);
    assert.equal(realtime.metrics().capacity, 1000);
  },
);

test(
  'backpressure desconecta consumidor lento em vez de crescer buffer ilimitado',
  { timeout: 3000 },
  async (t) => {
    const { realtime, join } = await fixture(t);
    const client = await join();
    const serverSocket = [...realtime.wss.clients][0];
    Object.defineProperty(serverSocket, 'bufferedAmount', {
      get: () => 1024 * 1024,
    });
    const closed = once(client.ws, 'close');
    realtime.broadcast({ t: 'notice', text: 'teste' });
    assert.equal((await closed)[0], 1013);
    assert.equal(realtime.metrics().slowConsumers, 1);
  },
);

test(
  'produção limita conexões por IP e entradas repetidas mesmo com novos sockets',
  { timeout: 3000 },
  async (t) => {
    const { realtime, join, connect } = await fixture(t, {
      production: true,
      maxConnectionsPerIp: 1,
      wsJoinPerMinute: 1,
    });
    const first = await join();
    const rejectedSocket = await connect();
    assert.equal((await once(rejectedSocket.ws, 'close'))[0], 1013);
    const firstClosed = once(first.ws, 'close');
    first.ws.close();
    await firstClosed;
    await waitFor(() => realtime.stats().online === 0);
    const rejectedJoin = await connect();
    const joinClosed = once(rejectedJoin.ws, 'close');
    rejectedJoin.ws.send(JSON.stringify({ t: 'join' }));
    assert.equal((await joinClosed)[0], 1008);
    assert.equal(realtime.stats().online, 0);
    assert.equal(realtime.metrics().rateLimited, 1);
  },
);

test(
  'falha de persistência recusa mutações recebidas e congela o tick',
  { timeout: 3000 },
  async (t) => {
    const { realtime, ctx, join } = await fixture(t);
    let healthy = true;
    ctx.persistence = { health: () => ({ ok: healthy }) };
    const client = await join();
    const player = ctx.players.get(client.welcome.id);
    const nick = player.nick;
    healthy = false;
    const closed = once(client.ws, 'close');
    client.ws.send(JSON.stringify({ t: 'nick', nick: 'Não gravar' }));
    assert.equal((await closed)[0], 1013);
    assert.equal(player.nick, nick);
    assert.equal(realtime.metrics().storageStopped, true);
    const ticks = realtime.metrics().ticks;
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(realtime.metrics().ticks, ticks);
  },
);

test('tick detecta storage unhealthy sem depender de novo frame', { timeout: 3000 }, async (t) => {
  const { realtime, ctx, join } = await fixture(t);
  let healthy = true;
  ctx.persistence = { health: () => ({ ok: healthy }) };
  const client = await join();
  const closed = once(client.ws, 'close');
  healthy = false;
  assert.equal((await closed)[0], 1013);
  assert.equal(realtime.metrics().storageStopped, true);
});

test(
  'espectador não cria veículo invisível para os demais jogadores',
  { timeout: 3000 },
  async (t) => {
    const { realtime, ctx, join } = await fixture(t);
    const client = await join({ spectate: true });
    const player = ctx.players.get(client.welcome.id);
    client.ws.send(JSON.stringify({ t: 'vehicle', kind: 1 }));
    await waitFor(() =>
      client.messages.some((m) => m.t === 'notice' && m.text.includes('espectador')),
    );
    assert.equal(player.mode, 0);
    assert.equal(player.vehicle, 0);
    assert.equal(realtime.stats().vehicles.length, 0);
    client.ws.send(JSON.stringify({ t: 'spectate', on: false }));
    client.ws.send(JSON.stringify({ t: 'vehicle', kind: 1 }));
    await waitFor(() => player.mode === 1);
    assert.equal(realtime.stats().vehicles.length, 1);
  },
);

test(
  'apelido via WS respeita validação do perfil e não finaliza cadastro pendente',
  { timeout: 3000 },
  async (t) => {
    const { ctx, join } = await fixture(t);
    const client = await join();
    const player = ctx.players.get(client.welcome.id);
    const original = player.nick;
    for (const nick of ['a', 'apelido-muito-longo', 'teste@x.com', '(11) 99999-1234']) {
      client.ws.send(JSON.stringify({ t: 'nick', nick }));
    }
    await waitFor(
      () =>
        client.messages.filter((m) => m.t === 'notice' && m.text.includes('2 a 12')).length === 4,
    );
    assert.equal(player.nick, original);
    client.ws.send(JSON.stringify({ t: 'nick', nick: '  <Novo>  Nome ' }));
    await waitFor(() => player.nick === 'Novo Nome');
    player.user = { id: 'pending', nick: 'Pessoa', nickPending: true };
    client.ws.send(JSON.stringify({ t: 'nick', nick: 'Outro Nome' }));
    await waitFor(() =>
      client.messages.some((m) => m.t === 'notice' && m.text.includes('perfil da conta')),
    );
    assert.equal(player.user.nick, 'Pessoa');
    assert.equal(player.user.nickPending, true);
  },
);
