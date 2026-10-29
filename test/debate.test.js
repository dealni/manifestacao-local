import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDebateMessage, initDebate, cleanupDebate, updateDebate } from '../src/debate.js';
function setup() {
  const sent = [],
    a = { id: 1, nick: 'Ana', x: -40, z: -49 },
    b = { id: 2, nick: 'Beto', x: -39, z: -49 },
    c = { id: 3, nick: 'Caio', x: 0, z: 0 };
  const ctx = {
    players: new Map([
      [1, a],
      [2, b],
      [3, c],
    ]),
    sendPlayer(p, m) {
      sent.push({ to: p.id, ...m });
    },
  };
  const act = (p, action, extra = {}) => handleDebateMessage(p, { t: 'cm', action, ...extra }, ctx);
  const create = () => {
    act(a, 'create', {
      x: -40,
      z: -49,
      yaw: 0,
      topic: 'Tema local',
      duration: 60,
    });
    return [...ctx.debateSessions.values()][0];
  };
  return { ctx, sent, a, b, c, act, create };
}
test('posicionamento exige região autorizada e alcance, cria uma mesa por anfitrião', () => {
  const { ctx, a, act, create } = setup();
  act(a, 'create', { x: 0, z: 0, yaw: 0, topic: 'Não' });
  assert.equal(ctx.debateSessions.size, 0);
  const s = create();
  assert.equal(s.host.id, 1);
  create();
  assert.equal(ctx.debateSessions.size, 1);
});
test('fila exige proximidade e só host aceita; cadeira ocupada não é sobrescrita', () => {
  const { ctx, a, b, c, act, create } = setup(),
    s = create();
  act(c, 'request', { session: s.id });
  assert.equal(s.queue.length, 0);
  act(b, 'request', { session: s.id });
  assert.equal(s.queue[0].id, 2);
  act(c, 'accept', { session: s.id, target: 2 });
  assert.equal(s.guest, null);
  act(a, 'accept', { session: s.id, target: 2 });
  assert.equal(s.guest.id, 2);
  assert.equal(s.queue.length, 0);
  assert.equal(initDebate(b, ctx)[1].role, 'guest');
  act(b, 'end', { session: s.id });
  assert.equal(ctx.debateSessions.size, 1);
});
test('timer pausa/retoma respeita host e controles antigos não ativam microfone', () => {
  const { ctx, a, b, act, create } = setup(),
    s = create();
  act(b, 'timer', { session: s.id, seconds: 1800, start: true });
  assert.equal(s.endsAt, null);
  act(a, 'timer', { session: s.id, seconds: 100, start: true });
  assert.ok(s.endsAt > Date.now());
  act(a, 'pause', { session: s.id });
  assert.equal(s.endsAt, null);
  assert.ok(s.remaining > 0);
  act(a, 'resume', { session: s.id });
  assert.ok(s.endsAt > Date.now());
  act(a, 'level', { session: s.id, target: 1, n: 9 });
  assert.equal(s.host.level, undefined);
  act(a, 'mute', { session: s.id, target: 1, on: true });
  assert.equal(s.host.muted, undefined);
  s.endsAt = Date.now() - 1;
  updateDebate(ctx);
  assert.equal(s.timerActive, false);
});
test('escuta remota conta ouvintes e limpeza remove sessão e referência', () => {
  const { ctx, a, c, act, create } = setup(),
    s = create();
  act(c, 'watch', { session: s.id });
  assert.equal(initDebate(c, ctx)[1].remote, s.id);
  assert.equal(initDebate(c, ctx)[0].sessions[0].listeners, 2);
  cleanupDebate(a, ctx);
  assert.equal(ctx.debateSessions.size, 0);
  assert.equal(c.debateRemote, null);
});
test('expulsão bloqueia visitante por id durante toda a mesa, mas permite mesa nova', () => {
  const { ctx, a, b, act, create } = setup(),
    s = create();
  act(b, 'request', { session: s.id });
  act(a, 'accept', { session: s.id, target: b.id });
  act(a, 'kick', { session: s.id, target: b.id });
  assert.equal(s.guest, null);
  assert.equal(initDebate(b, ctx)[1].blocked, true);
  act(b, 'request', { session: s.id });
  assert.equal(s.queue.length, 0);
  const resumed = { ...b };
  ctx.players.set(b.id, resumed);
  act(resumed, 'request', { session: s.id });
  assert.equal(s.queue.length, 0);
  // Nem uma entrada antiga na fila permite aceitar alguém já expulso.
  s.queue.push({ id: b.id });
  act(a, 'accept', { session: s.id, target: b.id });
  assert.equal(s.guest, null);
  act(a, 'end', { session: s.id });
  assert.equal(ctx.debateExpulsions.size, 0);
  const fresh = create();
  act(resumed, 'request', { session: fresh.id });
  assert.equal(fresh.queue.length, 1);
});
test('expulsão de conta vale para outra conexão e não afeta mesas diferentes', () => {
  const { ctx, a, b, c, act, create } = setup();
  b.userId = 'conta-b';
  const s = create();
  act(b, 'request', { session: s.id });
  act(a, 'accept', { session: s.id, target: b.id });
  act(a, 'kick', { session: s.id, target: b.id });
  const other = { ...b, id: 4 };
  ctx.players.set(4, other);
  act(other, 'request', { session: s.id });
  assert.equal(s.queue.length, 0);
  c.x = -40;
  c.z = -20;
  act(c, 'create', { x: -40, z: -20, yaw: 0, topic: 'Outra mesa' });
  const second = [...ctx.debateSessions.values()].find((row) => row.id !== s.id);
  other.x = second.x;
  other.z = second.z;
  act(other, 'request', { session: second.id });
  assert.equal(second.queue[0].id, other.id);
  cleanupDebate(a, ctx);
  assert.equal(ctx.debateExpulsions.has(s.id), false);
});

test('saídas sem mesas ativas não disparam uma nova transmissão para toda a sala', () => {
  const { ctx, a, sent } = setup();
  for (let i = 4; i <= 1000; i++) ctx.players.set(i, { id: i, nick: 'Teste', x: 0, z: 0 });
  for (let i = 0; i < 1000; i++) cleanupDebate(a, ctx);
  assert.equal(sent.length, 0);
});

test('debate vazio evita retransmissão idêntica e preserva mudanças e encerramento', () => {
  const { ctx, a, c, sent, act, create } = setup();
  updateDebate(ctx);
  assert.equal(sent.length, 6);
  sent.length = 0;
  updateDebate(ctx);
  assert.equal(sent.length, 0);
  c.debateListeningOff = true;
  updateDebate(ctx);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].t, 'cm_me');
  assert.equal(sent[0].to, c.id);
  sent.length = 0;
  const s = create();
  assert.ok(sent.some((m) => m.t === 'cm_state' && m.sessions.length === 1));
  sent.length = 0;
  act(a, 'end', { session: s.id });
  assert.ok(sent.some((m) => m.t === 'cm_state' && m.sessions.length === 0));
  sent.length = 0;
  updateDebate(ctx);
  assert.equal(sent.length, 0);
});

test('mesas ativas não retransmitem estado idêntico e browse afeta apenas o solicitante', () => {
  const { ctx, a, c, sent, act, create } = setup();
  create();
  for (let id = 4; id <= 1000; id++)
    ctx.players.set(id, { id, nick: 'Participante', x: 200, z: 600 });
  // Representa o limite de mesas; o teste não depende de geometria de criação.
  for (let id = 1; id < 30; id++)
    ctx.debateSessions.set(`mesa-${id}`, {
      ...ctx.debateSessions.values().next().value,
      id: `mesa-${id}`,
      x: 100,
      z: 100 + id * 10,
      host: { id: 1000 + id, nick: 'Anfitrião' },
      queue: [],
    });
  updateDebate(ctx);
  sent.length = 0;
  updateDebate(ctx);
  assert.equal(sent.length, 0);
  act(c, 'browse', { on: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].t, 'cm_me');
  assert.equal(sent[0].to, c.id);
  sent.length = 0;
  act(c, 'browse', { on: true });
  assert.equal(sent.length, 0);
  act(a, 'topic', { topic: 'Novo tema' });
  assert.equal(sent.filter((m) => m.t === 'cm_state').length, 1000);
  assert.equal(sent.filter((m) => m.t === 'cm_me').length, 0);
});

test('deduplicação preserva seleção por proximidade, ouvintes e consulta explícita', () => {
  const { ctx, c, sent, act, create } = setup();
  const s = create();
  sent.length = 0;
  c.x = s.x;
  c.z = s.z;
  updateDebate(ctx);
  assert.equal(sent.filter((m) => m.t === 'cm_state').length, 3);
  assert.equal(sent.find((m) => m.to === c.id).session.id, s.id);
  sent.length = 0;
  updateDebate(ctx);
  assert.equal(sent.length, 0);
  act(c, 'state');
  assert.equal(sent.length, 2);
  assert.ok(sent.every((m) => m.to === c.id));
});

test('sentar remove vínculo com caminhão, veículo, monitor e origem de deslocamento', () => {
  const { a, b, act, create } = setup();
  a.mode = 6;
  a.vehicle = 100001;
  const s = create();
  assert.equal(a.mode, 0);
  assert.equal(a.vehicle, 0);
  b.mode = 32;
  b.stageDeck = { owner: a.id, truck: 100001, x: 0, z: -1 };
  b.voiceMonitor = true;
  b.worldPrevious = { x: b.x + 70, z: b.z, at: Date.now() - 1000 };
  act(b, 'request', { session: s.id });
  act(a, 'accept', { session: s.id, target: b.id });
  assert.equal(s.guest.id, b.id);
  assert.equal(b.stageDeck, undefined);
  assert.equal(b.mode, 0);
  assert.equal(b.vehicle, 0);
  assert.equal(b.voiceMonitor, false);
  assert.equal(b.worldPrevious.x, b.x);
  assert.equal(b.worldPrevious.z, b.z);
  assert.ok(b.worldPrevious.at >= Date.now() - 1000);
});

test('espectador e participante de atração ou corrida não são transportados à cadeira', () => {
  for (const flag of ['spectator', 'secretRide', 'race', 'raceFrozen']) {
    const { ctx, a, b, act, create } = setup();
    a[flag] = true;
    create();
    assert.equal(ctx.debateSessions.size, 0);
    a[flag] = false;
    const s = create();
    act(b, 'request', { session: s.id });
    b[flag] = true;
    act(a, 'accept', { session: s.id, target: b.id });
    assert.equal(s.guest, null);
  }
});

test('ações atrasadas com mesa encerrada não atingem a mesa atual ou próxima', () => {
  const { ctx, a, b, act, create } = setup();
  const old = create();
  act(a, 'end', { session: old.id });
  const current = create();
  act(b, 'watch', { session: old.id });
  act(b, 'request', { session: old.id });
  assert.equal(b.debateRemote, undefined);
  assert.equal(current.queue.length, 0);
  act(a, 'topic', { session: old.id, topic: 'Tema atrasado' });
  act(a, 'end', { session: old.id });
  assert.equal(ctx.debateSessions.get(current.id), current);
  assert.equal(current.topic, 'Tema local');
  act(a, 'topic', { topic: 'Tema atual' });
  assert.equal(current.topic, 'Tema atual');
});

test('repetir pedido de fila preserva ordem e não acusa lotação para quem já está inscrito', () => {
  const { a, b, act, create, sent } = setup();
  const s = create();
  act(b, 'request', { session: s.id });
  s.queue.push(...Array.from({ length: 29 }, (_, i) => ({ id: 100 + i, nick: 'Na fila' })));
  const before = [...s.queue];
  sent.length = 0;
  act(b, 'request', { session: s.id });
  assert.deepEqual(s.queue, before);
  assert.equal(sent.length, 0);
  act(a, 'accept', { session: s.id, target: b.id });
  assert.equal(s.guest.id, b.id);
});
