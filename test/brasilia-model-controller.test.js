import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBrasiliaModelController,
  brasiliaTextureSize,
  brasiliaModelRuntimeSource,
} from '../scripts/brasilia-model-client.js';
const flush = () => new Promise((resolve) => setImmediate(resolve));
const models = Array.from({ length: 4 }, (_, i) => ({
  id: 'm' + i,
  path: '/m' + i,
  x: i * 10,
  z: 0,
}));
function setup(load, extra = {}) {
  const installed = [],
    removed = [],
    fallbacks = [];
  const controller = createBrasiliaModelController({
    models,
    load,
    install: (o, m) => installed.push(m.id),
    remove: (o) => removed.push(o),
    fallback: (m, v) => fallbacks.push([m.id, v]),
    ...extra,
  });
  return { controller, installed, removed, fallbacks };
}
test('modelos carregam apenas perto, concorrência dois, cache impede repetição', async () => {
  const pending = [];
  const state = setup(
    () => new Promise((resolve) => pending.push(() => resolve({ userData: {}, traverse() {} }))),
  );
  state.controller.update(3000, 0);
  await flush();
  assert.equal(pending.length, 0);
  state.controller.update(0, 0);
  await flush();
  assert.equal(pending.length, 2);
  pending.shift()();
  await flush();
  assert.equal(state.controller.stats().ready, 1);
  assert.equal(state.controller.stats().active, 2);
  state.controller.dispose();
  pending.forEach((resolve) => resolve());
  await flush();
  assert.equal(state.controller.stats().disposed, true);
  assert.equal(state.removed.length, 3);
});
test('falha mantém reserva e tenta novamente após intervalo', async () => {
  let clock = 0,
    attempts = 0;
  const state = setup(
    async () => {
      attempts++;
      throw Error('404');
    },
    { models: [models[0]], now: () => clock },
  );
  state.controller.update(0, 0);
  await flush();
  assert.deepEqual(state.fallbacks, [['m0', true]]);
  state.controller.update(0, 0);
  await flush();
  assert.equal(attempts, 1);
  clock = 16000;
  state.controller.update(0, 0);
  await flush();
  assert.equal(attempts, 2);
  state.controller.dispose();
});
test('timeout libera fila e descarta resultado tardio sem esconder reserva', async () => {
  let resolve, signal;
  const state = setup(
    (model, options) => {
      signal = options.signal;
      return new Promise((done) => (resolve = done));
    },
    { models: [models[0]], timeoutMs: 5 },
  );
  state.controller.update(0, 0);
  await new Promise((done) => setTimeout(done, 15));
  assert.equal(state.controller.stats().active, 0);
  assert.equal(signal.aborted, true);
  resolve({ late: true });
  await flush();
  assert.equal(state.removed.length, 1);
  assert.equal(state.installed.length, 0);
  state.controller.dispose();
});
test('erro na instalação libera recursos e preserva reserva', async () => {
  const state = setup(async () => ({ bad: true }), {
    models: [models[0]],
    install: () => {
      throw Error('inválido');
    },
  });
  state.controller.update(0, 0);
  await flush();
  assert.equal(state.removed.length, 1);
  assert.deepEqual(state.fallbacks, [['m0', true]]);
  state.controller.dispose();
});
test('mobile retém dois modelos mais próximos e libera geometria ao viajar', async () => {
  const state = setup(async () => ({ userData: {}, traverse() {} }), {
    mobile: true,
    models: models.map((model, index) => ({ ...model, x: index * 100 })),
  });
  state.controller.update(0, 0);
  await flush();
  await flush();
  assert.equal(state.controller.stats().ready, 2);
  assert.equal(state.controller.stats().cached, 2);
  state.controller.update(300, 0);
  await flush();
  await flush();
  assert.equal(state.controller.stats().ready, 2);
  assert.equal(state.controller.stats().cached, 2);
  assert.equal(state.removed.length, 2);
  state.controller.dispose();
});

test('texturas preservam proporção, limitam memória e não ampliam imagem', () => {
  assert.deepEqual(brasiliaTextureSize(2048, 1024, 512), { width: 512, height: 256 });
  assert.deepEqual(brasiliaTextureSize(1024, 2048, 1024), { width: 512, height: 1024 });
  assert.deepEqual(brasiliaTextureSize(256, 128, 512), { width: 256, height: 128 });
});

test('modelos seguem câmera do espectador e avatar no modo jogador', () => {
  const source = readFileSync(new URL('../scripts/brasilia-scene.js', import.meta.url), 'utf8');
  const expected = '__brasiliaModelController?.update(Ue?Mt.x:ot.x,Ue?Mt.z:ot.z)';
  assert.ok(source.includes(expected));
  const calls = [],
    context = {
      __brasiliaModelController: { update: (x, z) => calls.push([x, z]) },
      Ue: true,
      Mt: { x: 210, z: 580 },
      ot: { x: 0, z: -600 },
    };
  vm.runInNewContext(expected, context);
  context.Ue = false;
  vm.runInNewContext(expected, context);
  assert.deepEqual(calls, [
    [210, 580],
    [0, -600],
  ]);
});

test('modelo recupera após duas falhas com espera progressiva e limitada', async () => {
  let clock = 0,
    attempts = 0;
  const state = setup(
    async () => {
      if (++attempts < 3) throw Error('offline');
      return { userData: {}, traverse() {} };
    },
    { models: [models[0]], now: () => clock },
  );
  state.controller.update(0, 0);
  await flush();
  clock = 15000;
  state.controller.update(0, 0);
  await flush();
  clock = 44000;
  state.controller.update(0, 0);
  await flush();
  assert.equal(attempts, 2);
  clock = 45000;
  state.controller.update(0, 0);
  await flush();
  assert.equal(attempts, 3);
  assert.equal(state.controller.stats().ready, 1);
  state.controller.dispose();
});

test('mobile não recarrega modelos ao oscilar vinte centímetros na fronteira', async () => {
  let loads = 0;
  const state = setup(
    async () => {
      loads++;
      return { userData: {}, traverse() {} };
    },
    {
      mobile: true,
      models: models.slice(0, 3).map((model, index) => ({ ...model, x: index * 100 })),
    },
  );
  state.controller.update(99.9, 0);
  await flush();
  for (let index = 0; index < 8; index++) {
    state.controller.update(index % 2 ? 99.9 : 100.1, 0);
    await flush();
  }
  assert.equal(loads, 2);
  assert.equal(state.removed.length, 0);
  state.controller.update(130, 0);
  await flush();
  assert.equal(loads, 3);
  assert.equal(state.removed.length, 1);
  state.controller.dispose();
});

test('resultado atrasado depois de viajar é descartado sem instalar geometria distante', async () => {
  let resolve;
  const state = setup(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
    { models: [models[0]] },
  );
  state.controller.update(0, 0);
  await flush();
  state.controller.update(1000, 0);
  resolve({ late: true });
  await flush();
  assert.equal(state.installed.length, 0);
  assert.equal(state.removed.length, 1);
  assert.equal(state.controller.stats().cached, 0);
  state.controller.dispose();
});

test('resposta tardia respeita as duas vagas mobile mesmo dentro do raio', async () => {
  const pending = new Map();
  const state = setup((model) => new Promise((resolve) => pending.set(model.id, resolve)), {
    mobile: true,
    models: models.slice(0, 3).map((model, index) => ({ ...model, x: index * 100 })),
  });
  state.controller.update(99, 0);
  await flush();
  state.controller.update(130, 0);
  pending.get('m0')({ userData: {}, traverse() {} });
  await flush();
  assert.equal(state.installed.includes('m0'), false);
  assert.equal(state.removed.length, 1);
  pending.get('m1')({ userData: {}, traverse() {} });
  pending.get('m2')({ userData: {}, traverse() {} });
  await flush();
  assert.deepEqual(state.controller.stats().residentIds.sort(), ['m1', 'm2']);
  state.controller.dispose();
  assert.equal(state.controller.stats().ready, 0);
});

test('dispose aborta download pendente e não altera reservas após encerramento', async () => {
  let signal;
  const state = setup(
    (model, options) => {
      signal = options.signal;
      return new Promise((resolve, reject) =>
        signal.addEventListener('abort', () => reject(Error('abortado'))),
      );
    },
    { models: [models[0]] },
  );
  state.controller.update(0, 0);
  await flush();
  assert.equal(signal.aborted, false);
  state.controller.dispose();
  await flush();
  assert.equal(signal.aborted, true);
  assert.equal(state.controller.stats().active, 0);
  assert.deepEqual(state.fallbacks, []);
});

test('viagem aborta downloads distantes e libera as duas vagas imediatamente', async () => {
  const requests = [];
  const state = setup(
    (model, { signal }) => {
      requests.push({ id: model.id, signal });
      return new Promise(() => {});
    },
    {
      mobile: true,
      models: models.map((model, index) => ({ ...model, x: index * 100 })),
    },
  );
  try {
    state.controller.update(0, 0);
    await flush();
    assert.deepEqual(
      requests.map((request) => request.id),
      ['m0', 'm1'],
    );
    state.controller.update(300, 0);
    await flush();
    assert.ok(requests.slice(0, 2).every((request) => request.signal.aborted));
    assert.deepEqual(
      requests.slice(2).map((request) => request.id),
      ['m3', 'm2'],
    );
    assert.equal(state.controller.stats().active, 2);
    state.controller.update(0, 0);
    await flush();
    assert.deepEqual(
      requests.slice(4).map((request) => request.id),
      ['m0', 'm1'],
    );
    assert.equal(state.controller.stats().failedCount, 0);
  } finally {
    state.controller.dispose();
    await flush();
  }
});

test('retorno antes da rejeição de cancelamento não impõe espera de falha', async () => {
  const signals = [];
  const state = setup(
    (model, { signal }) => {
      signals.push(signal);
      return new Promise(() => {});
    },
    { models: [models[0]], now: () => 0 },
  );
  try {
    state.controller.update(0, 0);
    await flush();
    state.controller.update(1000, 0);
    state.controller.update(0, 0);
    await flush();
    assert.equal(signals.length, 2);
    assert.equal(signals[0].aborted, true);
    assert.equal(signals[1].aborted, false);
  } finally {
    state.controller.dispose();
    await flush();
  }
});

test('runtime serializado inclui o ciclo de carregamento sem depender dos módulos do preparador', async () => {
  const create = vm.runInNewContext(
    brasiliaModelRuntimeSource() + '; __brasiliaCreateModelController;',
    { AbortController, setTimeout, clearTimeout },
  );
  const installed = [];
  const controller = create({
    models: [models[0]],
    load: async () => ({ userData: {}, traverse() {} }),
    install: (_object, model) => installed.push(model.id),
    remove() {},
    fallback() {},
  });
  try {
    controller.update(0, 0);
    await flush();
    assert.deepEqual(installed, ['m0']);
    assert.equal(controller.stats().ready, 1);
  } finally {
    controller.dispose();
  }
});
