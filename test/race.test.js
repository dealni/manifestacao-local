import test from 'node:test';
import assert from 'node:assert/strict';
import { initRace, handleRaceMessage, tickRace, RACE_GATES } from '../src/race.js';
import { relocateWorldPlayer } from '../src/attractions.js';
function setup() {
  const messages = [];
  const a = { id: 1, userId: 'a', nick: 'A', mode: 1, x: 0, z: 0 },
    b = { id: 2, userId: 'b', nick: 'B', mode: 7, x: 0, z: 0 };
  const ctx = {
    state: {
      users: [
        { id: 'a', nick: 'A' },
        { id: 'b', nick: 'B' },
      ],
    },
    players: new Map([
      [1, a],
      [2, b],
    ]),
    raceConfig: { queue: 20, countdown: 10, racing: 50000 },
    broadcast: (m) => messages.push(m),
    sendPlayer: (p, m) => messages.push({ ...m, to: p.id }),
    save: () => {},
  };
  return { ctx, a, b, messages };
}
test('duas sessões entram, alinham, largam, completam portais e persistem pódio', () => {
  const { ctx, a, b, messages } = setup();
  const first = initRace(a, ctx);
  assert.equal(first.checkpoints, RACE_GATES.length);
  assert.equal(handleRaceMessage(a, { t: 'race', action: 'join' }, ctx), true);
  handleRaceMessage(b, { t: 'race', action: 'join' }, ctx);
  tickRace(ctx, first.until);
  assert.equal(ctx.race.phase, 'countdown');
  assert.equal(a.raceFrozen, true);
  assert.deepEqual(a.worldPrevious, { x: a.x, z: a.z, at: first.until });
  assert.equal(messages.filter((m) => m.t === 'relocate').length, 2);
  tickRace(ctx, ctx.race.until);
  assert.equal(ctx.race.phase, 'racing');
  assert.equal(a.raceFrozen, false);
  const start = ctx.race.startedAt;
  for (const [i, g] of RACE_GATES.entries()) {
    Object.assign(a, g);
    tickRace(ctx, start + i * 10 + 1);
  }
  assert.equal(ctx.state.users[0].raceStats.points, 100);
  assert.equal(ctx.race.rows.find((r) => r.id === 1).status, 'finished');
  for (const [i, g] of RACE_GATES.entries()) {
    Object.assign(b, g);
    tickRace(ctx, start + 1000 + i * 10);
  }
  assert.equal(ctx.race.phase, 'queue');
  assert.equal(ctx.race.previous.length, 2);
  assert.equal(ctx.state.users[1].raceStats.points, 80);
  assert.equal(initRace(a, ctx).global[0].nick, 'A');
});
test('fila pode sair e desconexão ou desmontar encerra inscrição', () => {
  const { ctx, a, b } = setup();
  initRace(a, ctx);
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  handleRaceMessage(a, { t: 'race', action: 'leave' }, ctx);
  assert.equal(ctx.race.rows.length, 0);
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  handleRaceMessage(b, { t: 'race', action: 'join' }, ctx);
  tickRace(ctx, ctx.race.until);
  ctx.players.delete(2);
  a.mode = 0;
  tickRace(ctx, ctx.race.until);
  assert.equal(ctx.race.phase, 'queue');
  assert.ok(ctx.race.previous.every((r) => r.status === 'dnf'));
});
test('recusa pedestre, conta ausente e checkpoint fora de ordem', () => {
  const { ctx, a, messages } = setup();
  a.mode = 0;
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  assert.equal(ctx.race.rows.length, 0);
  assert.equal(messages.at(-1).t, 'notice');
  a.mode = 1;
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  tickRace(ctx, ctx.race.until);
  tickRace(ctx, ctx.race.until);
  Object.assign(a, RACE_GATES.at(-1));
  tickRace(ctx, ctx.race.startedAt + 100);
  assert.equal(ctx.race.rows[0].checkpoint, 0);
});

function startRace(ctx, a) {
  initRace(a, ctx);
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  tickRace(ctx, ctx.race.until);
  tickRace(ctx, ctx.race.until);
  return ctx.race.startedAt;
}
test('teleporte seguido de retorno ao volante não cruza a chegada nem concede recompensa', () => {
  const { ctx, a } = setup(),
    start = startRace(ctx, a),
    row = ctx.race.rows[0];
  let finishes = 0;
  ctx.onRaceFinish = () => finishes++;
  row.checkpoint = RACE_GATES.length - 1;
  row.lastX = a.x = 0;
  row.lastZ = a.z = -620;
  a.mode = 0;
  // Destino real do comando palanque_ir para o time 0.
  relocateWorldPlayer(a, ctx, -18.2, -43.5, start + 1);
  a.mode = 1;
  tickRace(ctx, start + 2);
  assert.equal(row.checkpoint, RACE_GATES.length - 1);
  assert.equal(row.status, 'racing');
  assert.equal(row.points, 0);
  assert.equal(ctx.state.users[0].raceStats, undefined);
  assert.equal(finishes, 0);
  // A inscrição e uma chegada posterior por movimento real continuam válidas.
  Object.assign(a, RACE_GATES.at(-1));
  tickRace(ctx, start + 3);
  assert.equal(ctx.state.users[0].raceStats.finishes, 1);
  assert.equal(finishes, 1);
});
test('queda breve preserva inscrição e progresso, sem validar portais offline', () => {
  const { ctx, a } = setup(),
    start = startRace(ctx, a);
  const row = ctx.race.rows[0];
  Object.assign(a, RACE_GATES[0]);
  tickRace(ctx, start + 1);
  assert.equal(row.checkpoint, 1);
  ctx.players.delete(a.id);
  ctx.resumePlayer = (id) => (id === a.id ? a : null);
  Object.assign(a, RACE_GATES[1]);
  tickRace(ctx, start + 100);
  tickRace(ctx, start + 200);
  assert.equal(ctx.race.phase, 'racing');
  assert.equal(row.status, 'racing');
  assert.equal(row.checkpoint, 1);
  assert.equal(ctx.state.users[0].raceStats, undefined);
  ctx.players.set(a.id, a);
  initRace(a, ctx);
  tickRace(ctx, start + 300);
  assert.equal(row.checkpoint, 2);
  assert.equal(a.race, true);
  assert.equal(a.raceFrozen, false);
  for (let i = 2; i < RACE_GATES.length; i++) {
    Object.assign(a, RACE_GATES[i]);
    tickRace(ctx, start + 300 + i);
  }
  assert.equal(ctx.race.phase, 'queue');
  assert.equal(ctx.race.previous[0].status, 'finished');
  assert.equal(ctx.state.users[0].raceStats.finishes, 1);
});
test('expiração da janela de retomada encerra corrida sem creditar conta', () => {
  const { ctx, a } = setup(),
    start = startRace(ctx, a);
  ctx.players.delete(a.id);
  let retained = true;
  ctx.resumePlayer = (id) => (retained && id === a.id ? a : null);
  tickRace(ctx, start + 1);
  assert.equal(ctx.race.rows[0].status, 'racing');
  retained = false;
  tickRace(ctx, start + 10001);
  assert.equal(ctx.race.phase, 'queue');
  assert.equal(ctx.race.previous[0].status, 'dnf');
  assert.equal(ctx.state.users[0].raceStats, undefined);
});
test('contagem alinha jogador retido e retomada restaura pose e congelamento', () => {
  const { ctx, a, messages } = setup();
  initRace(a, ctx);
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  ctx.players.delete(a.id);
  ctx.resumePlayer = (id) => (id === a.id ? a : null);
  tickRace(ctx, ctx.race.until);
  assert.equal(a.raceFrozen, true);
  assert.equal(a.z, -400);
  assert.equal(messages.filter((m) => m.t === 'relocate').length, 0);
  const resumed = { ...a, x: 999, z: 999, race: false, raceFrozen: false };
  ctx.players.set(a.id, resumed);
  initRace(resumed, ctx);
  assert.equal(resumed.x, -3.2);
  assert.equal(resumed.z, -400);
  assert.equal(resumed.race, true);
  assert.equal(resumed.raceFrozen, true);
  tickRace(ctx, ctx.race.until);
  assert.equal(resumed.raceFrozen, false);
  assert.equal(ctx.race.phase, 'racing');
});
test('largada durante queda libera congelamento do jogador retido', () => {
  const { ctx, a } = setup();
  initRace(a, ctx);
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  tickRace(ctx, ctx.race.until);
  ctx.players.delete(a.id);
  ctx.resumePlayer = (id) => (id === a.id ? a : null);
  tickRace(ctx, ctx.race.until);
  assert.equal(a.raceFrozen, false);
  assert.equal(ctx.race.rows[0].checkpoint, 0);
  ctx.players.set(a.id, a);
  initRace(a, ctx);
  assert.equal(a.raceFrozen, false);
  assert.equal(a.race, true);
});
test('sessão revogada ou identidade trocada não recebe prêmio na chegada', () => {
  const { ctx, a } = setup(),
    start = startRace(ctx, a);
  const row = ctx.race.rows[0];
  row.checkpoint = RACE_GATES.length - 1;
  Object.assign(a, RACE_GATES.at(-1));
  a.userId = 'b';
  tickRace(ctx, start + 1);
  assert.equal(ctx.race.previous[0].status, 'dnf');
  assert.ok(ctx.state.users.every((user) => !user.raceStats));
});

test('mesma conta não ocupa outra vaga, nem cancela vaga de outra conexão', () => {
  const { ctx, a } = setup(),
    clone = { ...a, id: 3 };
  ctx.players.set(3, clone);
  initRace(a, ctx);
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  handleRaceMessage(clone, { t: 'race', action: 'join' }, ctx);
  assert.equal(ctx.race.rows.length, 1);
  handleRaceMessage(clone, { t: 'race', action: 'leave' }, ctx);
  assert.equal(ctx.race.rows.length, 1);
  tickRace(ctx, ctx.race.until);
  tickRace(ctx, ctx.race.until);
  assert.equal(initRace({ ...a }, ctx).phase, 'racing');
});

test('linhas duplicadas antigas não concedem segunda recompensa na mesma prova', () => {
  const { ctx, a, b } = setup(),
    clone = { ...a, id: 3 };
  ctx.players.set(3, clone);
  let finishes = 0;
  ctx.onRaceFinish = () => finishes++;
  initRace(a, ctx);
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  handleRaceMessage(b, { t: 'race', action: 'join' }, ctx);
  ctx.race.rows.push({ ...ctx.race.rows[0], id: 3 });
  tickRace(ctx, ctx.race.until);
  tickRace(ctx, ctx.race.until);
  for (const [i, g] of RACE_GATES.entries()) {
    Object.assign(a, g);
    Object.assign(clone, g);
    tickRace(ctx, ctx.race.startedAt + i + 1);
  }
  assert.equal(ctx.state.users[0].raceStats.finishes, 1);
  assert.equal(ctx.state.users[0].raceStats.points, 100);
  assert.equal(finishes, 1);
  assert.equal(ctx.race.rows.find((row) => row.id === 3).status, 'dnf');
});

test('visitante mantém bloqueio legado e participa quando acesso livre está ativo', () => {
  const { ctx, a, messages } = setup();
  delete a.userId;
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  assert.equal(ctx.race.rows.length, 0);
  assert.match(messages.at(-1).text, /Entre na sua conta/);
  ctx.freeAccess = true;
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  assert.equal(ctx.race.rows.length, 1);
  assert.equal(ctx.race.rows[0].entryId, 'guest:1');
});
test('visitantes distintos completam corrida e missões da sessão sem ranking persistente', () => {
  const { ctx, a, b } = setup();
  ctx.freeAccess = true;
  delete a.userId;
  delete b.userId;
  let saves = 0,
    rewards = 0;
  ctx.save = () => saves++;
  ctx.onRaceFinish = () => rewards++;
  initRace(a, ctx);
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  handleRaceMessage(b, { t: 'race', action: 'join' }, ctx);
  assert.equal(ctx.race.rows.length, 2);
  assert.deepEqual(
    ctx.race.rows.map((row) => row.entryId),
    ['guest:1', 'guest:2'],
  );
  tickRace(ctx, ctx.race.until);
  tickRace(ctx, ctx.race.until);
  const start = ctx.race.startedAt;
  for (const [i, g] of RACE_GATES.entries()) {
    Object.assign(a, g);
    tickRace(ctx, start + i + 1);
  }
  for (const [i, g] of RACE_GATES.entries()) {
    Object.assign(b, g);
    tickRace(ctx, start + 1000 + i);
  }
  assert.equal(ctx.race.phase, 'queue');
  assert.deepEqual(
    ctx.race.previous.map((row) => row.points),
    [100, 80],
  );
  assert.ok(
    ctx.race.previous.every(
      (row) =>
        row.status === 'finished' &&
        !Object.hasOwn(row, 'entryId') &&
        !Object.hasOwn(row, 'accountId'),
    ),
  );
  assert.equal(saves, 0);
  assert.equal(rewards, 2);
  assert.deepEqual(initRace(a, ctx).global, []);
  assert.ok(ctx.state.users.every((user) => !user.raceStats));
});
test('identidades de conta e visitante não colidem e snapshot não expõe identidade interna', () => {
  const { ctx, a, b } = setup();
  ctx.freeAccess = true;
  delete a.userId;
  b.userId = '1';
  ctx.state.users.push({ id: '1', nick: 'Conta' });
  initRace(a, ctx);
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  handleRaceMessage(b, { t: 'race', action: 'join' }, ctx);
  assert.deepEqual(
    ctx.race.rows.map((row) => row.entryId),
    ['guest:1', 'account:1'],
  );
  assert.ok(
    initRace(a, ctx).rows.every(
      (row) => !Object.hasOwn(row, 'entryId') && !Object.hasOwn(row, 'accountId'),
    ),
  );
  handleRaceMessage({ ...b, id: 3 }, { t: 'race', action: 'join' }, ctx);
  assert.equal(ctx.race.rows.length, 2);
});
test('visitante retoma sua sessão mas não herda vaga ao entrar em conta durante prova', () => {
  const { ctx, a } = setup();
  ctx.freeAccess = true;
  delete a.userId;
  const start = startRace(ctx, a);
  ctx.players.delete(a.id);
  ctx.resumePlayer = (id) => (id === a.id ? a : null);
  tickRace(ctx, start + 1);
  const resumed = { ...a, race: false };
  ctx.players.set(a.id, resumed);
  initRace(resumed, ctx);
  assert.equal(resumed.race, true);
  resumed.userId = 'a';
  tickRace(ctx, start + 2);
  assert.equal(ctx.race.previous[0].status, 'dnf');
  assert.ok(ctx.state.users.every((user) => !user.raceStats));
});
test('acesso livre preserva máximo de24pilotos incluindo visitantes', () => {
  const { ctx, messages } = setup();
  ctx.freeAccess = true;
  ctx.players.clear();
  for (let id = 1; id <= 25; id++) {
    const p = { id, nick: `Visitante${id}`, mode: 1, x: 0, z: 0 };
    ctx.players.set(id, p);
    handleRaceMessage(p, { t: 'race', action: 'join' }, ctx);
  }
  assert.equal(ctx.race.rows.length, 24);
  assert.match(messages.at(-1).text, /máximo de 24 pilotos/);
  assert.equal(new Set(ctx.race.rows.map((row) => row.entryId)).size, 24);
});

test('chegada no prazo expirado encerra como dnf sem prêmio ou callback', () => {
  for (const delay of [0, 1000]) {
    const { ctx, a } = setup();
    let finishes = 0;
    ctx.onRaceFinish = () => finishes++;
    startRace(ctx, a);
    ctx.race.rows[0].checkpoint = RACE_GATES.length - 1;
    Object.assign(a, RACE_GATES.at(-1));
    tickRace(ctx, ctx.race.until + delay);
    assert.equal(ctx.race.phase, 'queue');
    assert.equal(ctx.race.previous[0].status, 'dnf');
    assert.equal(ctx.race.previous[0].points, 0);
    assert.equal(ctx.state.users[0].raceStats, undefined);
    assert.equal(finishes, 0);
    assert.equal(a.race, false);
    assert.equal(a.raceFrozen, false);
  }
});

test('expiração da retomada durante alinhamento não interrompe a simulação', () => {
  const { ctx, a } = setup();
  initRace(a, ctx);
  handleRaceMessage(a, { t: 'race', action: 'join' }, ctx);
  ctx.players.delete(a.id);
  let checks = 0;
  ctx.resumePlayer = () => (++checks === 1 ? a : null);
  assert.doesNotThrow(() => tickRace(ctx, ctx.race.until));
  assert.equal(ctx.race.phase, 'queue');
  assert.equal(ctx.race.previous[0].status, 'dnf');
  assert.equal(ctx.state.users[0].raceStats, undefined);
});
