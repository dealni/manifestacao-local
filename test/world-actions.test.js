import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { brasiliaLayout } from '../src/brasilia-layout.js';
import assert from 'node:assert/strict';
import { initWorld, handleWorldMessage, handleWorldHttp, worldTick } from '../src/world-actions.js';
function fixture() {
  const messages = [],
    broadcasts = [];
  let saves = 0;
  const a = { id: 1, user: { id: 'a' }, team: 0, nick: 'A', x: 216, z: -529, mode: 0, yaw: 0 };
  const b = { id: 2, user: { id: 'b' }, team: 1, nick: 'B', x: 218, z: -529, mode: 0, yaw: 0 };
  a.user.owned = {
    pvpEnabled: true,
    objetos: ['push', 'dialogo', 'foam', 'pillow', 'fish', 'blades'],
  };
  b.user.owned = { pvpEnabled: true, objetos: ['push'] };
  const ctx = {
    state: { users: [a.user, b.user], world: {} },
    players: new Map([
      [1, a],
      [2, b],
    ]),
    save() {
      saves++;
    },
    sendPlayer(p, m) {
      messages.push({ id: p.id, ...structuredClone(m) });
    },
    broadcast(m) {
      broadcasts.push(structuredClone(m));
    },
    send(res, status, data) {
      Object.assign(res, { status, data });
    },
  };
  return { a, b, ctx, messages, broadcasts, saves: () => saves };
}
test('welcome oferece estados completos sem enviar mensagens antes do id', () => {
  const f = fixture(),
    s = initWorld(f.a, f.ctx);
  assert.equal(f.messages.length, 0);
  assert.deepEqual(s.secretPlaces.rides, []);
  assert.equal(s.secretProgress.hp, 100);
  assert.equal(s.physical.members.length, 2);
  assert.equal(s.youtube, null);
});
test('spray salva por superfície e camada; pacote pode reconstruir após reinício', () => {
  const f = fixture();
  initWorld(f.a, f.ctx);
  handleWorldMessage(f.a, { t: 'px', m: 0, c: 2, s: 1, d: ['g1.54.-133', 120, 150] }, f.ctx);
  assert.equal(f.saves(), 1);
  assert.equal(f.ctx.state.world.paint['g1.54.-133'].layers[0].length, 1);
  const state = structuredClone(f.ctx.state);
  f.ctx.state = state;
  delete f.ctx.localWorld;
  handleWorldMessage(f.b, { t: 'px_get', b: -12 }, f.ctx);
  assert.deepEqual(f.messages.at(-1).g, ['g1.54.-133', 0, 1, 120, 150, 2, 1, 0, 0]);
  handleWorldMessage(f.a, { t: 'px', m: 1, d: ['g1.54.-133', 120, 150] }, f.ctx);
  assert.equal(f.ctx.state.world.paint['g1.54.-133'].layers[0].length, 0);
});
test('spray ignora chaves e valores malformados', () => {
  const f = fixture();
  handleWorldMessage(f.a, { t: 'px', d: ['__proto__', 1, 2, 'x', 1, 2] }, f.ctx);
  assert.equal(Object.keys(f.ctx.state.world.paint).length, 0);
  assert.equal(handleWorldMessage(f.a, {}, f.ctx), false);
});
test('ação secreta exige proximidade e vento respeita enchimento/liberação e captura de1.5s', () => {
  const original = Date.now;
  let clock = 10000;
  Date.now = () => clock;
  try {
    const f = fixture();
    initWorld(f.a, f.ctx);
    f.b.x = 0;
    handleWorldMessage(f.b, { t: 'secret_place', place: 'wind-plant', action: 'capture' }, f.ctx);
    assert.equal(f.ctx.state.world.secret.wind.fill, 0);
    for (let i = 0; i < 4; i++) {
      handleWorldMessage(f.a, { t: 'secret_place', place: 'wind-plant', action: 'capture' }, f.ctx);
      handleWorldMessage(f.a, { t: 'secret_place', place: 'wind-plant', action: 'capture' }, f.ctx);
      assert.equal(f.ctx.state.world.secret.wind.fill, (i + 1) * 25);
      clock += 1500;
    }
    assert.equal(f.ctx.state.world.secret.wind.fill, 100);
    handleWorldMessage(f.a, { t: 'secret_place', place: 'wind-plant', action: 'release' }, f.ctx);
    assert.equal(f.ctx.state.world.secret.wind.fill, 0);
    assert.ok(f.ctx.state.world.secret.wind.gustAt > 0);
  } finally {
    Date.now = original;
  }
});
test('PvP exige consentimento do alvo, distância e aplica cooldown', () => {
  const f = fixture();
  initWorld(f.a, f.ctx);
  initWorld(f.b, f.ctx);
  handleWorldMessage(f.a, { t: 'pvp', on: true, weapon: 'dialogo' }, f.ctx);
  handleWorldMessage(f.a, { t: 'attack' }, f.ctx);
  assert.equal(f.broadcasts.at(-1).actions.length, 1);
  f.a.attackAt = 0;
  handleWorldMessage(f.b, { t: 'pvp', on: true, weapon: 'push' }, f.ctx);
  handleWorldMessage(f.a, { t: 'attack' }, f.ctx);
  assert.equal(f.broadcasts.at(-1).actions.length, 2);
  const count = f.broadcasts.length;
  handleWorldMessage(f.a, { t: 'attack' }, f.ctx);
  assert.equal(f.broadcasts.length, count);
  assert.equal(f.ctx.state.world.progress.a.mission.counts.meleeHits, 1);
});
test('progresso de movimento ignora teleport e mantém identidade da conta', () => {
  const f = fixture();
  initWorld(f.a, f.ctx);
  worldTick(f.a, f.ctx);
  f.a.worldPrevious.at -= 1000;
  f.a.x += 10;
  worldTick(f.a, f.ctx);
  assert.equal(f.ctx.state.world.progress.a.mission.counts.walk, 10);
  f.a.x += 1000;
  worldTick(f.a, f.ctx);
  assert.equal(f.ctx.state.world.progress.a.mission.counts.walk, 10);
  const reconnect = { ...f.a, id: 8 };
  assert.equal(initWorld(reconnect, f.ctx).secretProgress.hp, 100);
});

test('passageiro não ganha caminhada, condução nem atividade pelo deslocamento da carona', () => {
  const f = fixture();
  initWorld(f.a, f.ctx);
  worldTick(f.a, f.ctx);
  Object.assign(f.a, { mode: 33, vehicle: 100000, vehicleSeat: { driver: 2, vehicle: 100000 } });
  f.a.worldPrevious.at -= 1000;
  f.a.x += 10;
  worldTick(f.a, f.ctx);
  assert.deepEqual(f.ctx.state.world.progress.a.mission.counts, {});
  Object.assign(f.a, { mode: 0, vehicle: 0 });
  delete f.a.vehicleSeat;
  f.a.worldPrevious.at -= 1000;
  f.a.x += 1;
  worldTick(f.a, f.ctx);
  assert.equal(f.ctx.state.world.progress.a.mission.counts.walk, 1);
  assert.equal(f.ctx.state.world.progress.a.mission.counts.drive, undefined);
  assert.ok(f.ctx.state.world.progress.a.mission.counts.activeMs >= 1000);
  assert.ok(f.ctx.state.world.progress.a.mission.counts.activeMs <= 2000);
});

test('atividade de várias conexões da conta conta a união dos intervalos, inclusive após retomada', () => {
  const original = Date.now;
  let clock = 10000;
  Date.now = () => clock;
  try {
    const f = fixture();
    initWorld(f.a, f.ctx);
    const clones = Array.from({ length: 10 }, (_, i) => ({ ...f.a, id: i + 10 }));
    for (const p of clones) worldTick(p, f.ctx);
    clock += 1000;
    for (const p of clones) {
      p.x += 1;
      worldTick(p, f.ctx);
    }
    const counts = f.ctx.state.world.progress.a.mission.counts;
    assert.equal(counts.activeMs, 1000);
    clock += 1000;
    const resumed = { ...clones[0], id: 99 };
    resumed.x += 1;
    worldTick(resumed, f.ctx);
    assert.equal(counts.activeMs, 2000);
    clock += 1000;
    worldTick(resumed, f.ctx); // parado não contribui nem preenche a janela seguinte
    assert.equal(counts.activeMs, 2000);
    clock += 1000;
    resumed.x += 1;
    worldTick(resumed, f.ctx);
    assert.equal(counts.activeMs, 3000);
    initWorld(f.b, f.ctx);
    worldTick(f.b, f.ctx);
    clock += 1000;
    f.b.x += 1;
    worldTick(f.b, f.ctx);
    assert.equal(f.ctx.state.world.progress.b.mission.counts.activeMs, 1000);
  } finally {
    Date.now = original;
  }
});

test('ticks defasados não perdem atividade legítima anterior a outro intervalo da mesma conta', () => {
  const original = Date.now;
  let clock = 10000;
  Date.now = () => clock;
  try {
    const f = fixture(),
      other = { ...f.a, id: 9 };
    initWorld(f.a, f.ctx);
    worldTick(f.a, f.ctx);
    clock = 10250;
    worldTick(other, f.ctx);
    clock = 10500;
    other.x += 1;
    worldTick(other, f.ctx);
    clock = 11000;
    f.a.x += 1;
    worldTick(f.a, f.ctx);
    assert.equal(f.ctx.state.world.progress.a.mission.counts.activeMs, 1000);
  } finally {
    Date.now = original;
  }
});
test('glitter e padaria respeitam intervalo e somente possuem dados locais', () => {
  const f = fixture();
  initWorld(f.a, f.ctx);
  handleWorldMessage(f.a, { t: 'glitter', action: 'drop' }, f.ctx);
  handleWorldMessage(f.a, { t: 'glitter', action: 'drop' }, f.ctx);
  assert.equal(f.ctx.localWorld.glitter.drops.length, 1);
  f.a.x = 191.6;
  f.a.z = 2.4;
  handleWorldMessage(f.a, { t: 'bakery', action: 'fire' }, f.ctx);
  assert.equal(f.ctx.localWorld.bakery.shots.length, 1);
  assert.ok(f.ctx.localWorld.bakery.shots[0].to.y > 0);
});
test('inventário HTTP local descreve interações e não consome rotas alheias', async () => {
  const f = fixture(),
    res = {};
  assert.equal(
    await handleWorldHttp(
      { method: 'GET' },
      res,
      new URL('http://localhost/api/local/world'),
      f.ctx,
    ),
    true,
  );
  assert.ok(res.data.places.length > 8);
  assert.equal(
    await handleWorldHttp({ method: 'POST' }, res, new URL('http://localhost/api/auth'), f.ctx),
    false,
  );
});

// Executa os decodificadores e a semântica de pintura reais, extraídos do bundle.
const client = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
function originalFunction(name, end) {
  return client.slice(
    client.indexOf(`function ${name}(`),
    client.indexOf(end, client.indexOf(`function ${name}(`)),
  );
}
const consumer =
  vm.runInNewContext(`(()=>{const wr=9,Jo=[.1,.2,.36],AY={layer:320},ux=()=>[[],[],[]],xn=n=>Math.max(0,Math.min(2,n));
 ${originalFunction('MY', 'class yw')}
 ${originalFunction('Mw', 'function CY')}
 return {MY,Mw,SY};})()`);
function decoded(g) {
  return JSON.parse(JSON.stringify(consumer.Mw(g)));
}
test('px_get array entrega bandas numéricas independentes aceitas pelo listener original e inclui paredes', () => {
  const f = fixture();
  for (const key of ['g1.30.-13', 'g1.30.0', 'g1.30.12']) {
    const [, x, z] = key.split('.');
    f.a.x = Number(x) * 4 + 1;
    f.a.z = Number(z) * 4 + 1;
    handleWorldMessage(f.a, { t: 'px', c: 1, s: 1, d: [key, 100, 100] }, f.ctx);
  }
  const bands = [-2, -1, 0, 1, 2];
  f.messages.length = 0;
  handleWorldMessage(f.b, { t: 'px_get', b: bands }, f.ctx);
  assert.deepEqual(
    f.messages.map((m) => m.b),
    bands,
  );
  const expectedWalls = vm.runInNewContext(
    `(()=>{const HE="${/const HE =\s*"([A-Za-z0-9+/=]+)"/.exec(client)[1]}",VE=${/\bVE = (\d+)/.exec(client)[1]}; const atob=s=>Buffer.from(s,'base64').toString('binary');return ${client.slice(client.indexOf('H1 = (() => {') + 5, client.indexOf('  kr = 16,') - 2)};})()`,
    { Buffer, __brasiliaLayout: brasiliaLayout },
  );
  const wall = expectedWalls[0];
  f.a.x = wall.ax + wall.tx;
  f.a.z = wall.az + wall.tz;
  handleWorldMessage(f.a, { t: 'px', c: 1, s: 1, d: ['w0.0', 100, 100] }, f.ctx);
  const expectedWallBand = Math.floor((wall.az + wall.tz * 2) / 48);
  handleWorldMessage(f.b, { t: 'px_get', b: [expectedWallBand] }, f.ctx);
  const wallResponse = f.messages.find((m) => m.b === expectedWallBand);
  assert.ok(wallResponse, 'primeira parede pertence ao recorte requisitado');
  assert.ok(decoded(wallResponse.g).some((tile) => tile.key === 'w0.0'));
  const loaded = [];
  // Corpo literal do listener original: rejeitaria b array e ignora tiles de outras bandas.
  const listenerStart = client.indexOf('e.addEventListener("px_band", (de) => {');
  const listener = client.slice(
    listenerStart + 'e.addEventListener("px_band", (de) => {'.length,
    client.indexOf('  }),', listenerStart),
  );
  for (const response of f.messages)
    vm.runInNewContext(`(()=>{${listener}})()`, {
      de: { detail: response },
      s: bands,
      i: new Map(),
      a: new Set(),
      d() {},
      u: (tiles) => loaded.push(...tiles),
      Mw: consumer.Mw,
    });
  assert.ok(loaded.some((tile) => tile.key === 'g1.30.-13'));
  assert.ok(loaded.some((tile) => tile.key === 'g1.30.0'));
  assert.ok(loaded.some((tile) => tile.key === 'g1.30.12'));
  for (const invalid of [[0, '0', null, {}, 0], [1.5]])
    handleWorldMessage(f.b, { t: 'px_get', b: invalid }, f.ctx);
  assert.ok(f.messages.every((m) => Number.isInteger(m.b)));
});
test('borracha replica MY e reentrada preserva desenhos distantes e máscaras de sobreposição parcial', () => {
  const f = fixture(),
    key = 'g1.30.0';
  f.a.x = 122;
  f.a.z = 2;
  const expected = [];
  const operations = [
    { u: 100, v: 100, c: 1, s: 1 },
    { u: 130, v: 100, c: 2, s: 2 },
    { u: 300, v: 300, c: 3, s: 0 },
    { u: 100, v: 100, c: 9, s: 1 },
  ];
  for (const op of operations) {
    consumer.MY(expected, op);
    handleWorldMessage(
      f.a,
      { t: 'px', m: op.c === 9 ? 1 : 0, c: op.c, s: op.s, d: [key, op.u, op.v] },
      f.ctx,
    );
  }
  assert.deepEqual(f.ctx.state.world.paint[key].layers[0], expected);
  assert.ok(expected.some((op) => op.u === 300));
  assert.ok(expected.some((op) => op.c === 9));
  const persisted = JSON.parse(JSON.stringify(f.ctx.state));
  const reconnect = fixture();
  reconnect.ctx.state = persisted;
  handleWorldMessage(reconnect.b, { t: 'px_get', b: [0] }, reconnect.ctx);
  const restored = decoded(reconnect.messages.at(-1).g)[0].layers[0].map(({ u, v, c, s }) => ({
    u,
    v,
    c,
    s,
  }));
  assert.deepEqual(restored, expected);
  const actualLive = [];
  for (const message of f.broadcasts.filter((m) => m.t === 'px'))
    for (const group of consumer.SY(message.g))
      for (const op of group.ops) consumer.MY(actualLive, { u: op.u, v: op.v, c: op.c, s: op.s });
  assert.deepEqual(actualLive, restored);
});
test('eventos PvP permanecem válidos no pose original e expiram após duração', () => {
  const start = client.indexOf(
    '  pose(e) {',
    client.indexOf('  receive(e) {', client.indexOf('  me = { owned: !1')),
  );
  const end = client.indexOf('  previewVehicleHit(', start);
  const make = vm.runInNewContext(`(function(){return {${client.slice(start, end)}}})`);
  for (const weapon of ['push', 'dialogo', 'foam', 'pillow', 'fish', 'blades']) {
    const f = fixture();
    initWorld(f.a, f.ctx);
    initWorld(f.b, f.ctx);
    handleWorldMessage(f.a, { t: 'pvp', on: true, weapon }, f.ctx);
    handleWorldMessage(f.b, { t: 'pvp', on: true }, f.ctx);
    handleWorldMessage(f.a, { t: 'attack' }, f.ctx);
    const actions = f.broadcasts.at(-1).actions;
    let clock = actions[0].at;
    const view = Object.assign(make(), {
      predicted: new Map(),
      actions: new Map(actions.map((a) => [a.id, a])),
      phases: new Map(),
      opts: { net: { serverNow: () => clock } },
      serverNow: () => clock,
    });
    for (const action of actions) {
      assert.ok(Number.isFinite(action.duration));
      assert.ok(action.clip.startsWith('pvp_'));
      assert.equal(view.pose(action.id), action);
    }
    clock += 2000;
    assert.equal(view.pose(f.a.id), undefined);
    assert.equal(view.pose(f.b.id), undefined);
  }
});

test('spray rejeita superfícies remotas, inexistentes, fora do mapa e entradas não numéricas sem efeitos persistentes', () => {
  const f = fixture();
  initWorld(f.a, f.ctx);
  const before = structuredClone(f.ctx.state);
  for (const [key, u, v] of [
    ['g0.0.100', 100, 100],
    ['g1.999999.99999', 100, 100],
    ['w999999.0', 100, 100],
    ['g1.54.-133', 401, 100],
    ['g1.54.-133', -1, 100],
    ['g1.54.-133', 100, 1600],
    ['g1.54.-133', NaN, 100],
    ['g1.54.-133', 100, Infinity],
    ['g1.54.-133', '100', 100],
    ['g1.54.-133', null, 100],
    ['g0.054.-133', 100, 100],
    ['g0.54.-0133', 100, 100],
  ])
    for (const t of ['px', 'px_mark'])
      handleWorldMessage(f.a, t === 'px' ? { t, d: [key, u, v] } : { t, k: key, u, v }, f.ctx);
  handleWorldMessage(f.a, { t: 'px_bogus', d: ['g1.54.-133', 100, 100] }, f.ctx);
  assert.deepEqual(f.ctx.state, before);
  assert.equal(f.saves(), 0);
  assert.equal(f.broadcasts.length, 0);
});

test('spray e marcação exigem participante a pé; espectador ainda pode consultar pintura', () => {
  for (const mode of [{ spectator: true }, { mode: 1 }, { secretRide: true }]) {
    const f = fixture();
    initWorld(f.a, f.ctx);
    Object.assign(f.a, mode);
    const before = structuredClone(f.ctx.state);
    handleWorldMessage(f.a, { t: 'px', d: ['g1.54.-133', 100, 100] }, f.ctx);
    handleWorldMessage(f.a, { t: 'px_mark', k: 'g1.54.-133', u: 100, v: 100 }, f.ctx);
    assert.deepEqual(f.ctx.state, before);
    assert.equal(f.saves(), 0);
    assert.equal(f.broadcasts.length, 0);
    handleWorldMessage(f.a, { t: 'px_get', b: -12 }, f.ctx);
    assert.equal(f.messages.at(-1).t, 'px_band');
  }
});

test('pintura e marcação próximas continuam válidas e limites parciais do mapa validam o ponto', () => {
  for (const [x, z, key, u, v] of [
    [0, 120, 'g0.0.30', 100, 100],
    [216, -529, 'g1.54.-133', 100, 100],
    [-260, 120, 'g1.-66.30', 400, 100],
    [260, 120, 'g0.65.30', 0, 100],
    [120, -640, 'g1.30.-161', 100, 400],
    [120, 640, 'g1.30.160', 100, 0],
  ]) {
    const f = fixture();
    initWorld(f.a, f.ctx);
    Object.assign(f.a, { x, z });
    handleWorldMessage(f.a, { t: 'px', c: 2, s: 1, d: [key, u, v] }, f.ctx);
    handleWorldMessage(f.a, { t: 'px_mark', c: 2, k: key, u, v }, f.ctx);
    assert.equal(f.ctx.state.world.paint[key].layers[0].length, 2, key);
    assert.equal(f.ctx.state.world.progress.a.mission.counts.marks, 1, key);
    assert.equal(
      f.ctx.state.world.progress.a.mission.counts.remoteAreas,
      Math.abs(x) > 80 ? 1 : undefined,
      key,
    );
  }
  for (const [x, z, key, u, v] of [
    [-260, 120, 'g0.-66.30', 399, 100],
    [260, 120, 'g0.65.30', 1, 100],
    [120, -640, 'g0.30.-161', 100, 399],
    [120, 640, 'g0.30.160', 100, 1],
  ]) {
    const f = fixture();
    initWorld(f.a, f.ctx);
    Object.assign(f.a, { x, z });
    handleWorldMessage(f.a, { t: 'px', d: [key, u, v] }, f.ctx);
    assert.deepEqual(f.ctx.state.world.paint, {}, key);
    assert.equal(f.saves(), 0, key);
  }
});

test('alcance horizontal de spray aceita borda quantizada e rejeita ponto além de quatro metros', () => {
  const f = fixture();
  initWorld(f.a, f.ctx);
  f.a.x = 120;
  f.a.z = 120;
  handleWorldMessage(f.a, { t: 'px', d: ['g1.31.30', 0, 0] }, f.ctx);
  assert.equal(f.ctx.state.world.paint['g1.31.30'].layers[0].length, 1);
  handleWorldMessage(f.a, { t: 'px_mark', k: 'g1.31.30', u: 2, v: 0 }, f.ctx);
  assert.equal(f.ctx.state.world.paint['g1.31.30'].layers[0].length, 1);
  assert.equal(f.ctx.state.world.progress.a.mission.counts.marks, undefined);
});

test('paredes usam origem e tangentes reais; segmento final não aceita pintura além da fachada', () => {
  const walls = vm.runInNewContext(
    `(()=>{const HE="${/const HE =\s*"([A-Za-z0-9+/=]+)"/.exec(client)[1]}",VE=${/\bVE = (\d+)/.exec(client)[1]}; const atob=s=>Buffer.from(s,'base64').toString('binary');return ${client.slice(client.indexOf('H1 = (() => {') + 5, client.indexOf('  kr = 16,') - 2)};})()`,
    { Buffer, __brasiliaLayout: brasiliaLayout },
  );
  const index = walls.findIndex(
    (w) =>
      !w.disabled &&
      w.L % 4 > 0.1 &&
      w.L % 4 < 3.5 &&
      Math.abs(w.bx) < 250 &&
      Math.abs(w.bz) < 630 &&
      (w.bx > 40 || w.bz > 40),
  );
  assert.ok(index >= 0);
  const wall = walls[index],
    tile = Math.floor(wall.L / 4),
    width = wall.L - tile * 4,
    key = `w${index}.${tile}`;
  const f = fixture();
  initWorld(f.a, f.ctx);
  f.a.x = wall.ax + wall.tx * (tile * 4 + width / 2);
  f.a.z = wall.az + wall.tz * (tile * 4 + width / 2);
  handleWorldMessage(f.a, { t: 'px', c: 2, d: [key, Math.round(width * 50), 200] }, f.ctx);
  assert.equal(f.ctx.state.world.paint[key].layers[0].length, 1);
  const before = structuredClone(f.ctx.state);
  const saves = f.saves();
  handleWorldMessage(f.a, { t: 'px', d: [key, Math.ceil(width * 100) + 2, 200] }, f.ctx);
  f.a.x += 20;
  handleWorldMessage(f.a, { t: 'px_mark', k: key, u: Math.round(width * 50), v: 200 }, f.ctx);
  assert.deepEqual(f.ctx.state, before);
  assert.equal(f.saves(), saves);
});

test('área de paz bloqueia tinta mas mantém borracha próxima para pinturas antigas', () => {
  const f = fixture();
  initWorld(f.a, f.ctx);
  f.a.x = 0;
  f.a.z = 0;
  const key = 'g0.0.0';
  handleWorldMessage(f.a, { t: 'px', c: 2, d: [key, 100, 100] }, f.ctx);
  assert.equal(f.ctx.state.world.paint[key], undefined);
  f.ctx.state.world.paint[key] = { top: 0, layers: [[{ u: 100, v: 100, c: 2, s: 0 }], [], []] };
  handleWorldMessage(f.a, { t: 'px', m: 1, d: [key, 100, 100] }, f.ctx);
  assert.equal(f.ctx.state.world.paint[key].layers[0].length, 0);
});

test('espectador não habilita PvP, ataca ou recebe impactos mesmo com consentimento antigo', () => {
  const f = fixture();
  initWorld(f.a, f.ctx);
  initWorld(f.b, f.ctx);
  f.a.spectator = true;
  handleWorldMessage(f.a, { t: 'pvp', on: true }, f.ctx);
  assert.equal(f.a.pvp.on, false);
  // Estado antigo não pode contornar o bloqueio no ponto de uso.
  f.a.pvp.on = true;
  f.b.pvp.on = true;
  f.broadcasts.length = 0;
  handleWorldMessage(f.a, { t: 'attack' }, f.ctx);
  assert.equal(f.broadcasts.length, 0);
  assert.equal(f.ctx.state.world.progress.a.mission.counts.meleeHits, undefined);
  handleWorldMessage(f.b, { t: 'attack' }, f.ctx);
  assert.deepEqual(
    f.broadcasts.at(-1).actions.map((a) => a.kind),
    ['attack'],
  );
  assert.equal(f.ctx.state.world.progress.b.mission.counts.meleeHits, undefined);
});

test('mesmo ponto possui apenas uma superfície de chão, sem duplicar marcas nem áreas', () => {
  for (const [x, z, real, fake] of [
    [121, 121, 'g1.30.30', 'g0.30.30'],
    [1, 121, 'g0.0.30', 'g1.0.30'],
  ]) {
    const f = fixture();
    initWorld(f.a, f.ctx);
    Object.assign(f.a, { x, z });
    handleWorldMessage(f.a, { t: 'px_mark', k: real, u: 100, v: 100, c: 2 }, f.ctx);
    const before = structuredClone(f.ctx.state),
      saves = f.saves();
    for (const t of ['px', 'px_mark'])
      handleWorldMessage(
        f.a,
        t === 'px' ? { t, d: [fake, 100, 100], c: 2 } : { t, k: fake, u: 100, v: 100, c: 2 },
        f.ctx,
      );
    assert.deepEqual(f.ctx.state, before);
    assert.equal(f.saves(), saves);
    assert.equal(f.ctx.state.world.progress.a.mission.counts.marks, 1);
    assert.equal(f.ctx.state.world.paint[fake], undefined);
  }
});

test('borracha sem tinta não cria superfície nem progresso e remoção legítima não concede missões', () => {
  for (const erase of [
    { m: 1, c: 2 },
    { m: 0, c: 9 },
  ])
    for (const x of [0, 120]) {
      const f = fixture();
      initWorld(f.a, f.ctx);
      f.a.x = x;
      f.a.z = 0;
      const key = x === 0 ? 'g0.0.0' : 'g1.30.0';
      const before = structuredClone(f.ctx.state);
      for (const t of ['px', 'px_mark'])
        handleWorldMessage(
          f.a,
          t === 'px'
            ? { t, d: [key, 100, 100], ...erase }
            : { t, k: key, u: 100, v: 100, ...erase },
          f.ctx,
        );
      assert.deepEqual(f.ctx.state, before);
      assert.equal(f.saves(), 0);
      assert.equal(f.broadcasts.length, 0);
      // Estado legado existente pode ser apagado sem obter crédito de pintura/marcação.
      f.ctx.state.world.paint[key] = { top: 0, layers: [[{ u: 100, v: 100, c: 2, s: 0 }], [], []] };
      handleWorldMessage(f.a, { t: 'px_mark', k: key, u: 100, v: 100, ...erase }, f.ctx);
      assert.equal(f.ctx.state.world.paint[key].layers[0].length, 0);
      assert.equal(f.saves(), 1);
      assert.deepEqual(f.ctx.state.world.progress.a.mission.counts, {});
      handleWorldMessage(f.a, { t: 'px_mark', k: key, u: 100, v: 100, ...erase }, f.ctx);
      assert.equal(f.saves(), 1);
      assert.equal(f.broadcasts.length, 1);
    }
});

test('revogar acesso PvP do alvo impede impacto e crédito de missão com consentimento antigo', () => {
  const f = fixture();
  initWorld(f.a, f.ctx);
  initWorld(f.b, f.ctx);
  handleWorldMessage(f.a, { t: 'pvp', on: true }, f.ctx);
  handleWorldMessage(f.b, { t: 'pvp', on: true }, f.ctx);
  f.b.user.owned = {};
  f.broadcasts.length = 0;
  handleWorldMessage(f.a, { t: 'attack' }, f.ctx);
  assert.deepEqual(
    f.broadcasts.at(-1).actions.map((action) => action.kind),
    ['attack'],
  );
  assert.equal(f.ctx.state.world.progress.a.mission.counts.meleeHits, undefined);
});

test('espectador não lança glitter nem dispara a padaria ou consome seus intervalos', () => {
  const f = fixture();
  initWorld(f.a, f.ctx);
  Object.assign(f.a, { spectator: true, x: 191.6, z: 2.4 });
  handleWorldMessage(f.a, { t: 'glitter', action: 'drop' }, f.ctx);
  handleWorldMessage(f.a, { t: 'bakery', action: 'fire' }, f.ctx);
  assert.equal(f.ctx.localWorld.glitter.drops.length, 0);
  assert.equal(f.ctx.localWorld.bakery.shots.length, 0);
  assert.equal(f.ctx.localWorld.bakery.readyAt, 0);
  assert.equal(f.a.glitterReady, undefined);
  assert.equal(f.broadcasts.length, 0);
  f.a.spectator = false;
  handleWorldMessage(f.a, { t: 'glitter', action: 'drop' }, f.ctx);
  handleWorldMessage(f.a, { t: 'bakery', action: 'fire' }, f.ctx);
  assert.equal(f.ctx.localWorld.glitter.drops.length, 1);
  assert.equal(f.ctx.localWorld.bakery.shots.length, 1);
});
