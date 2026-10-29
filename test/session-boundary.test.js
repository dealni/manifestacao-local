import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { createLocalServer } from '../src/server.js';
import { resolveAccountTicket } from '../src/auth.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(predicate) {
  const end = Date.now() + 2000;
  while (Date.now() < end) {
    const value = predicate();
    if (value) return value;
    await sleep(5);
  }
  throw new Error('Condição de sessão não alcançada');
}
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-session-'));
  const app = await createLocalServer({ dataDir: dir, port: 0 });
  const address = await app.listen(),
    base = `http://127.0.0.1:${address.port}`;
  const state = app.ctx.state;
  state.users.push(
    { id: 'alice', nick: 'Alice', email: 'alice@example.test', verified: true },
    {
      id: 'bruno',
      nick: 'Bruno',
      email: 'bruno@example.test',
      verified: true,
      ticket: 'legacy-public-ticket',
    },
  );
  const tokens = {
    a: randomBytes(32).toString('hex'),
    a2: randomBytes(32).toString('hex'),
    b: randomBytes(32).toString('hex'),
  };
  for (const [name, token] of Object.entries(tokens))
    state.sessions[token] = {
      userId: name === 'b' ? 'bruno' : 'alice',
      expiresAt: Date.now() + 60000,
    };
  const cookie = (name) => `local_session=${tokens[name]}`;
  async function json(route, body, name, rawCookie) {
    const r = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(rawCookie ? { cookie: rawCookie } : name ? { cookie: cookie(name) } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  }
  async function ticket(name) {
    return (await json('/api/jogos/manifestacao/conta', undefined, name)).data.ticket;
  }
  const opened = [];
  async function socket({ name, join = {}, rawCookie } = {}) {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws', {
        headers: {
          origin: base,
          ...(rawCookie ? { cookie: rawCookie } : name ? { cookie: cookie(name) } : {}),
        },
      }),
      messages = [];
    ws.on('message', (b, binary) => messages.push(binary ? Buffer.from(b) : JSON.parse(b)));
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    opened.push(ws);
    ws.send(JSON.stringify({ t: 'join', nick: 'Visitante', team: 0, ...join }));
    const welcome = await until(() => messages.find((m) => m.t === 'welcome'));
    return {
      ws,
      messages,
      welcome,
      get p() {
        return app.ctx.players.get(welcome.id);
      },
      send: (m) => ws.send(JSON.stringify(m)),
    };
  }
  t.after(async () => {
    for (const ws of opened) ws.terminate();
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { app, state, tokens, cookie, json, ticket, socket, base };
}

test('IDs públicos e tickets legados não autenticam join nem trocam a conta do cookie', async (t) => {
  const f = await fixture(t);
  for (const forged of [
    'bruno',
    'local:bruno',
    'legacy-public-ticket',
    'localv1:' + '0'.repeat(64),
  ]) {
    const guest = await f.socket({ join: { ticket: forged } });
    assert.equal(guest.p.userId, undefined);
    guest.send({ t: 'nick', nick: 'VisitanteNovo' });
  }
  const a = await f.socket({ name: 'a', join: { ticket: 'local:bruno' } });
  assert.equal(a.p.userId, 'alice');
  a.send({ t: 'account', ticket: 'local:bruno' });
  a.send({ t: 'nick', nick: 'AliceNova' });
  await until(() => f.state.users[0].nick === 'AliceNova');
  assert.equal(f.state.users[1].nick, 'Bruno');
  assert.equal(a.p.userId, 'alice');
});

test('ticket opaco não contém cookie/ID e permite login legítimo no socket já aberto', async (t) => {
  const f = await fixture(t),
    a = await f.socket(),
    ticket = await f.ticket('a');
  assert.match(ticket, /^localv1:[a-f0-9]{64}$/);
  assert.ok(!ticket.includes(f.tokens.a));
  assert.ok(!ticket.includes('alice'));
  a.send({ t: 'account', ticket });
  await until(
    () =>
      a.p.userId === 'alice' &&
      a.messages.some((m) => m.t === 'social' && m.a === 'hello' && m.uid === 'alice'),
  );
  assert.ok(a.messages.some((m) => m.t === 'social' && m.a === 'hello' && m.uid === 'alice'));
  const b = await f.socket({ join: { ticket } });
  assert.equal(b.p.userId, 'alice');
  assert.equal(await f.ticket('a'), ticket);
});

test('logout remove identidade, fila e recepção privada em todos os sockets da sessão, preservando sessão independente', async (t) => {
  const f = await fixture(t),
    ticket = await f.ticket('a');
  const a = await f.socket({ name: 'a' }),
    second = await f.socket({ join: { ticket } }),
    independent = await f.socket({ name: 'a2' }),
    b = await f.socket({ name: 'b' });
  f.state.social.friends.push(['alice', 'bruno']);
  a.send({ t: 'vehicle', kind: 1 });
  await until(() => a.p.mode === 1);
  a.send({ t: 'race', action: 'join' });
  await until(() => f.app.ctx.race.rows.length === 1);
  assert.equal((await f.json('/api/auth/logout', {}, 'a')).status, 200);
  await until(() => !a.p.userId && !second.p.userId);
  assert.equal(independent.p.userId, 'alice');
  assert.equal(f.app.ctx.race.rows.length, 0);
  assert.equal(resolveAccountTicket(ticket, f.state), null);
  const start = a.messages.length,
    secondStart = second.messages.length,
    indStart = independent.messages.length;
  b.send({ t: 'social', a: 'dm', uid: 'alice', text: 'Somente sessão válida' });
  await until(() =>
    independent.messages.slice(indStart).some((m) => m.t === 'social' && m.a === 'dm'),
  );
  assert.ok(!a.messages.slice(start).some((m) => m.t === 'social' && m.a === 'dm'));
  assert.ok(!second.messages.slice(secondStart).some((m) => m.t === 'social' && m.a === 'dm'));
  const oldNick = f.state.users[0].nick;
  a.send({ t: 'nick', nick: 'GuestDepois' });
  await sleep(25);
  assert.equal(f.state.users[0].nick, oldNick);
  a.send({ t: 'account', ticket });
  await sleep(25);
  assert.equal(a.p.userId, undefined);
});

test('expiração invalida leitura, input binário e ticks que persistem progresso de conta', async (t) => {
  const f = await fixture(t),
    a = await f.socket({ name: 'a' });
  f.state.sessions[f.tokens.a].expiresAt = Date.now() - 1;
  const input = Buffer.alloc(10);
  input[0] = 7;
  input.writeUInt32LE(7, 1);
  input.writeInt16LE(32767, 5);
  a.ws.send(input);
  await until(() => !a.p.userId);
  const before = JSON.stringify(f.state.world.progress.alice);
  await sleep(1100);
  assert.equal(JSON.stringify(f.state.world.progress.alice), before);
  a.send({ t: 'social', a: 'inbox' });
  await until(() => a.messages.some((m) => m.t === 'social' && m.a === 'guest'));
});

test('troca entre contas limpa salas, foco e fila antes de aplicar credencial fresca', async (t) => {
  const f = await fixture(t),
    a = await f.socket({ name: 'a' });
  a.p.socialThread = 'bruno';
  a.send({ t: 'vehicle', kind: 1 });
  await until(() => a.p.mode === 1);
  a.send({ t: 'race', action: 'join' });
  await until(() => f.app.ctx.race.rows.length === 1);
  delete f.state.sessions[f.tokens.a];
  const bTicket = await f.ticket('b');
  a.send({ t: 'account', ticket: bTicket });
  await until(() => a.p.userId === 'bruno');
  assert.equal(a.p.socialThread, undefined);
  assert.equal(f.app.ctx.race.rows.length, 0);
  assert.equal(a.p.nick, 'Bruno');
});

test('token de retomada não recupera autenticação revogada e veículo retoma em sessão válida', async (t) => {
  const f = await fixture(t),
    a = await f.socket({ name: 'a' });
  a.send({ t: 'vehicle', kind: 1 });
  await until(() => a.p.mode === 1);
  const vehicle = a.p.vehicle,
    id = a.p.id,
    token = a.welcome.token;
  await new Promise((resolve) => {
    a.ws.once('close', resolve);
    a.ws.close();
  });
  const resumed = await f.socket({
    name: 'a',
    join: { token, resume: { mode: 1 } },
  });
  assert.equal(resumed.p.id, id);
  assert.equal(resumed.p.mode, 1);
  assert.equal(resumed.p.vehicle, vehicle);
  assert.equal(resumed.p.userId, 'alice');
  await f.json('/api/auth/logout', {}, 'a');
  await new Promise((resolve) => {
    resumed.ws.once('close', resolve);
    resumed.ws.close();
  });
  const guest = await f.socket({ join: { token, ticket: 'local:alice' } });
  assert.equal(guest.p.userId, undefined);
});

test('rotação por login e reset revogam sockets e tickets de todas as sessões afetadas', async (t) => {
  const f = await fixture(t);
  const registration = {
    email: 'reset@example.test',
    nick: 'ResetLocal',
    password: 'SenhaInicial2026!',
  };
  const created = await f.json('/api/auth/register', registration);
  const verified = await f.json('/api/auth/verify', {
    email: registration.email,
    code: created.data.localCode,
  });
  const firstCookie = verified.cookie;
  const first = await f.socket({ rawCookie: firstCookie });
  const firstTicket = (
    await f.json('/api/jogos/manifestacao/conta', undefined, undefined, firstCookie)
  ).data.ticket;
  const login = await f.json(
    '/api/auth/login',
    { email: registration.email, password: registration.password },
    undefined,
    firstCookie,
  );
  assert.equal(login.status, 200);
  await until(() => !first.p.userId);
  assert.equal(resolveAccountTicket(firstTicket, f.state), null);
  const second = await f.socket({ rawCookie: login.cookie });
  const otherLogin = await f.json('/api/auth/login', {
    email: registration.email,
    password: registration.password,
  });
  const other = await f.socket({ rawCookie: otherLogin.cookie });
  const reset = await f.json('/api/auth/forgot', { email: registration.email });
  const changed = await f.json('/api/auth/reset', {
    email: registration.email,
    code: reset.data.localCode,
    password: 'SenhaNova2026!',
  });
  assert.equal(changed.status, 200);
  await until(() => !second.p.userId && !other.p.userId);
  const fresh = await f.socket({ rawCookie: changed.cookie });
  assert.ok(fresh.p.userId);
  const nickname = f.state.users.find((u) => u.email === registration.email).nick;
  second.send({ t: 'nick', nick: 'SemSessao' });
  await sleep(25);
  assert.equal(f.state.users.find((u) => u.email === registration.email).nick, nickname);
});

test('corrida mantém veículo e inscrição ao retomar conexão brevemente interrompida', async (t) => {
  const f = await fixture(t),
    a = await f.socket({ name: 'a' });
  a.send({ t: 'vehicle', kind: 1 });
  await until(() => a.p.mode === 1);
  a.send({ t: 'race', action: 'join' });
  await until(() => f.app.ctx.race.rows.length === 1);
  const token = a.welcome.token,
    id = a.p.id,
    vehicle = a.p.vehicle;
  await new Promise((resolve) => {
    a.ws.once('close', resolve);
    a.ws.close();
  });
  await sleep(120);
  assert.equal(f.app.ctx.race.rows.length, 1);
  const resumed = await f.socket({ name: 'a', join: { token } });
  assert.equal(resumed.p.id, id);
  assert.equal(resumed.p.vehicle, vehicle);
  assert.equal(resumed.p.mode, 1);
  assert.equal(f.app.ctx.race.rows[0].status, 'queued');
});

test('socket substituído em fechamento não conserva identidade nem grava após logout', async (t) => {
  const f = await fixture(t),
    a = await f.socket({ name: 'a' });
  const old = a.p;
  a.ws._socket.pause();
  try {
    const replacement = await f.socket({
      name: 'a',
      join: { token: a.welcome.token },
    });
    assert.equal(replacement.p.id, old.id);
    assert.notEqual(replacement.p, old);
    await f.json('/api/auth/logout', {}, 'a');
    const nick = f.state.users[0].nick;
    a.send({ t: 'nick', nick: 'REVOGADO' });
    const input = Buffer.alloc(10);
    input[0] = 7;
    input.writeInt16LE(32767, 5);
    a.ws.send(input);
    await sleep(80);
    assert.equal(f.state.users[0].nick, nick);
    assert.equal(replacement.p.userId, undefined);
    assert.equal(old.inputSeq, undefined);
  } finally {
    a.ws._socket.resume();
  }
});

test('join e style publicam apenas IDs de desenhos aprovados da própria conta', async (t) => {
  const f = await fixture(t);
  f.state.designs.push(
    { id: 'c111111111111111', userId: 'alice', paid: true, status: 'approved' },
    { id: 'c222222222222222', userId: 'bruno', paid: true, status: 'approved' },
  );
  const own = await f.socket({
    name: 'a',
    join: { design: 'c111111111111111' },
  });
  assert.equal(own.p.design, 'c111111111111111');
  const other = await f.socket({
    name: 'a',
    join: { design: 'c222222222222222' },
  });
  assert.equal(other.p.design, null);
  own.send({ t: 'style', design: 'c222222222222222' });
  await sleep(25);
  assert.equal(own.p.design, 'c111111111111111');
  own.send({ t: 'style', design: null });
  await until(() => own.p.design === null);
  own.send({ t: 'style', design: 'c111111111111111' });
  await until(() => own.p.design === 'c111111111111111');
  await f.json('/api/auth/logout', {}, 'a');
  assert.equal(own.p.design, null);
});

test('índice de identidade acompanha reordenação e recusa conta removida imediatamente', async (t) => {
  const f = await fixture(t),
    a = await f.socket({ name: 'a' });
  assert.equal(a.p.userId, 'alice');
  f.state.users.reverse();
  a.send({ t: 'input', x: 0, z: 0, seq: 777 });
  await until(() => a.p.identityIndex === 1);
  assert.equal(a.p.user.id, 'alice');
  f.state.users.splice(1, 1);
  a.send({ t: 'input', x: 0, z: 0, seq: 778 });
  await until(() => !a.p.userId);
  assert.equal(f.state.users[0].id, 'bruno');
});
