import test from 'node:test';
import assert from 'node:assert/strict';
import { detectVehicleHits } from '../src/vehicle-hits.js';
import { initWorld, worldVehicleTick, handleWorldMessage } from '../src/world-actions.js';

function fixture() {
  const driver = {
    id: 1,
    userId: 'a',
    team: 0,
    x: 0,
    z: 100,
    yaw: 0,
    mode: 1,
    vehicle: 100001,
    pvp: { on: true, weapon: 'push' },
  };
  const target = {
    id: 2,
    userId: 'b',
    team: 1,
    x: 0,
    z: 102.6,
    yaw: 0,
    mode: 0,
    vehicle: 0,
    pvp: { on: true, weapon: 'push' },
  };
  const broadcasts = [];
  const ctx = {
    state: {
      users: [
        { id: 'a', owned: { pvpEnabled: true } },
        { id: 'b', owned: { pvpEnabled: true } },
      ],
    },
    players: new Map([
      [1, driver],
      [2, target],
    ]),
    save() {},
    broadcast: (m) => broadcasts.push(m),
  };
  return { driver, target, ctx, broadcasts };
}
function crossing(f, at = 10000) {
  detectVehicleHits(f.target, f.ctx, at);
  detectVehicleHits(f.driver, f.ctx, at);
  f.driver.z += 0.8;
  return detectVehicleHits(f.driver, f.ctx, at + 50);
}

test('trajetória real de carro produz uma queda com autor, sem mensagem de hit do cliente', () => {
  const f = fixture(),
    hits = crossing(f);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 2);
  assert.equal(hits[0].by, 1);
  assert.equal(hits[0].kind, 'fall');
});
for (const [name, change] of [
  [
    'velocidade declarada sem deslocamento',
    (f) => {
      f.driver.speed = 999;
      f.driver.z -= 0.8;
    },
  ],
  [
    'teleporte',
    (f) => {
      f.driver.z += 10;
      f.target.z += 10;
    },
  ],
  [
    'mesmo time',
    (f) => {
      f.target.team = 0;
    },
  ],
  [
    'alvo sem consentimento',
    (f) => {
      f.target.pvp.on = false;
    },
  ],
  [
    'motorista sem consentimento',
    (f) => {
      f.driver.pvp.on = false;
    },
  ],
  [
    'alvo sem passe PvP',
    (f) => {
      f.ctx.state.users[1].owned = {};
    },
  ],
  [
    'alvo no veículo',
    (f) => {
      f.target.mode = 1;
      f.target.vehicle = 100002;
    },
  ],
  [
    'espectador',
    (f) => {
      f.target.spectator = true;
    },
  ],
  [
    'corrida',
    (f) => {
      f.driver.race = true;
    },
  ],
  [
    'alvo no debate',
    (f) => {
      f.ctx.debateSessions = new Map([[1, { host: f.target }]]);
    },
  ],
  [
    'veículo premium sem acesso',
    (f) => {
      f.driver.mode = 3;
    },
  ],
  [
    'dirigível',
    (f) => {
      f.driver.mode = 4;
    },
  ],
  [
    'roadster no ar',
    (f) => {
      f.driver.mode = 12;
      f.driver.rocket = { alt: 2 };
      f.ctx.state.users[0].owned.veiculos = ['tesla-roadster'];
    },
  ],
  [
    'proteção ativa da estátua',
    (f) => {
      f.ctx.state.world = { secret: { wards: [{ owner: 2, until: 20000 }] } };
    },
  ],
  [
    'troca de veículo durante segmento',
    (f) => {
      f.driver.vehicle++;
    },
  ],
])
  test(`não concede atropelamento: ${name}`, () => {
    const f = fixture();
    detectVehicleHits(f.target, f.ctx, 10000);
    detectVehicleHits(f.driver, f.ctx, 10000);
    f.driver.z += 0.8;
    change(f);
    assert.deepEqual(detectVehicleHits(f.driver, f.ctx, 10050), []);
  });
test('alvo ou motorista dentro da área de paz não contam', () => {
  const f = fixture();
  f.driver.z = 0;
  f.target.z = 2.6;
  assert.deepEqual(crossing(f), []);
});
test('não conta ocupação inicial, repetição do tick ou vítima ainda caída', () => {
  const f = fixture();
  assert.equal(crossing(f).length, 1);
  assert.deepEqual(detectVehicleHits(f.driver, f.ctx, 10050), []);
  f.driver.z = 100;
  detectVehicleHits(f.driver, f.ctx, 10100);
  f.driver.z = 100.8;
  assert.deepEqual(detectVehicleHits(f.driver, f.ctx, 10150), []);
  f.driver.z = 100;
  detectVehicleHits(f.target, f.ctx, 14000);
  detectVehicleHits(f.driver, f.ctx, 14000);
  f.driver.z = 100.8;
  assert.equal(detectVehicleHits(f.driver, f.ctx, 14050).length, 1);
  const g = fixture();
  g.target.z = 101;
  assert.deepEqual(crossing(g), []);
});
test('gaps de tick e spam de poses não transformam saltos em colisão', () => {
  const f = fixture();
  detectVehicleHits(f.target, f.ctx, 10000);
  detectVehicleHits(f.driver, f.ctx, 10000);
  f.driver.z += 0.8;
  assert.deepEqual(detectVehicleHits(f.driver, f.ctx, 11000), []);
  const g = fixture();
  detectVehicleHits(g.target, g.ctx, 10000);
  detectVehicleHits(g.driver, g.ctx, 10000);
  g.driver.z += 5;
  g.target.z = 105;
  assert.deepEqual(detectVehicleHits(g.driver, g.ctx, 10050), []);
});
test('missão recebe contagem somente pelo hook servidor e persiste progresso', () => {
  const f = fixture();
  initWorld(f.driver, f.ctx);
  let saves = 0;
  f.ctx.saveProgress = () => saves++;
  const original = Date.now;
  try {
    Date.now = () => 10000;
    worldVehicleTick(f.target, f.ctx);
    worldVehicleTick(f.driver, f.ctx);
    assert.equal(handleWorldMessage(f.driver, { t: 'vehicle_hit', target: 2 }, f.ctx), false);
    f.driver.z += 0.8;
    Date.now = () => 10050;
    worldVehicleTick(f.driver, f.ctx);
    assert.equal(f.ctx.state.world.progress.a.mission.counts.vehicleHits, 1);
    assert.equal(f.broadcasts.at(-1).t, 'physical');
    assert.equal(saves, 1);
    worldVehicleTick(f.driver, f.ctx);
    assert.equal(f.ctx.state.world.progress.a.mission.counts.vehicleHits, 1);
  } finally {
    Date.now = original;
  }
});

test('mesma conta alvo só concede missão novamente após dois minutos, inclusive reconexão', () => {
  const f = fixture();
  initWorld(f.driver, f.ctx);
  const original = Date.now;
  const pass = (at) => {
    f.driver.z = 100;
    Date.now = () => at;
    worldVehicleTick(f.target, f.ctx);
    worldVehicleTick(f.driver, f.ctx);
    f.driver.z = 100.8;
    Date.now = () => at + 50;
    worldVehicleTick(f.target, f.ctx);
    worldVehicleTick(f.driver, f.ctx);
  };
  try {
    pass(10000);
    assert.equal(f.ctx.state.world.progress.a.mission.counts.vehicleHits, 1);
    pass(14000);
    assert.equal(f.ctx.state.world.progress.a.mission.counts.vehicleHits, 1);
    // Novos objetos de conexão preservam os IDs das contas no estado durável.
    f.driver = { ...f.driver };
    f.target = { ...f.target };
    f.ctx.players = new Map([
      [1, f.driver],
      [2, f.target],
    ]);
    pass(20000);
    assert.equal(f.ctx.state.world.progress.a.mission.counts.vehicleHits, 1);
    pass(130000);
    assert.equal(f.ctx.state.world.progress.a.mission.counts.vehicleHits, 2);
    assert.ok(f.ctx.state.world.progress.a.vehicleHitTargets['user:b']);
    assert.equal(f.ctx.state.world.progress.a.mission.vehicleHitTargets, undefined);
  } finally {
    Date.now = original;
  }
});

test('rotação impossível e teleporte do pedestre não geram impacto', () => {
  for (const change of [
    (f) => {
      f.driver.yaw = Math.PI / 2;
    },
    (f) => {
      f.target.z -= 8;
    },
  ]) {
    const f = fixture();
    detectVehicleHits(f.target, f.ctx, 10000);
    detectVehicleHits(f.driver, f.ctx, 10000);
    f.driver.z += 0.8;
    change(f);
    assert.deepEqual(detectVehicleHits(f.driver, f.ctx, 10050), []);
  }
});

test('pouso do Roadster não converte o deslocamento aéreo anterior em atropelamento', () => {
  for (const altitude of [0, 1]) {
    const f = fixture();
    f.driver.mode = 12;
    f.driver.rocket = { alt: altitude };
    f.target.z = 103;
    f.ctx.state.users[0].owned.veiculos = ['tesla-roadster'];
    detectVehicleHits(f.target, f.ctx, 10000);
    detectVehicleHits(f.driver, f.ctx, 10000);
    f.driver.rocket.alt = 0;
    f.driver.z += 0.8;
    assert.equal(detectVehicleHits(f.driver, f.ctx, 10050).length, altitude ? 0 : 1);
  }
});
