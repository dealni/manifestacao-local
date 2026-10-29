import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { applyTurnstileClient } from '../scripts/turnstile-client.js';

const scaffold = `  const post = (path, body) => qt(path, { method: "POST", body: JSON.stringify(__withReferral(path, body)) });
[go("E-MAIL", input)], "Enviar código"
[go("CÓDIGO", code)], "Entrar"`;
const patched = applyTurnstileClient(scaffold);
const runtime = patched.slice(0, patched.indexOf('\n  const captcha'));

function fixture(render) {
  const removed = [];
  const callbacks = [];
  const context = vm.createContext({
    xt: { auth: { turnstileSiteKey: 'mock-public' } },
    T: () => ({ clientWidth: 200 }),
    window: {
      turnstile: {
        render(host, options) {
          callbacks.push(options);
          return render ? render(host, options) : callbacks.length;
        },
        remove(id) {
          removed.push(id);
        },
      },
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });
  vm.runInContext(runtime + '\nglobalThis.makeChallenge = __emailChallenge;', context);
  return { context, callbacks, removed };
}

test('Turnstile cancela tentativa anterior ao iniciar outra sem deixar promessa pendente', async () => {
  const f = fixture();
  const challenge = f.context.makeChallenge(() => true);
  const first = challenge.token();
  const rejected = assert.rejects(first, /nova verificação/);
  await Promise.resolve();
  const second = challenge.token();
  await Promise.resolve();
  await rejected;
  assert.deepEqual(f.removed, [1]);
  f.callbacks[0].callback('obsolete');
  f.callbacks[1].callback('fresh');
  assert.equal(await second, 'fresh');
  f.context.makeChallenge(() => true);
  assert.deepEqual(f.removed, [1, 2]);
});

test('Turnstile descarta desafio substituído durante carregamento mesmo com active verdadeiro', async () => {
  const f = fixture();
  const old = f.context.makeChallenge(() => true);
  const pending = old.token();
  f.context.makeChallenge(() => true);
  await assert.rejects(pending, /Abra o login/);
  assert.equal(f.callbacks.length, 0);
  await assert.rejects(old.token(), /Abra o login/);
});

test('Turnstile remove widget quando render dispara erro síncrono antes de retornar ID', async () => {
  const f = fixture((_host, options) => {
    options['error-callback']();
    return 42;
  });
  const challenge = f.context.makeChallenge(() => true);
  await assert.rejects(challenge.token(), /falhou/);
  assert.deepEqual(f.removed, [42]);
});

test('eventos tardios de script que falhou não invalidam o carregamento da nova tentativa', async () => {
  const scripts = [];
  const timers = new Set();
  const context = vm.createContext({
    window: {},
    document: {
      createElement: () => ({ remove() {} }),
      head: { append: (script) => scripts.push(script) },
    },
    setTimeout: (callback) => {
      timers.add(callback);
      return callback;
    },
    clearTimeout: (callback) => timers.delete(callback),
  });
  vm.runInContext(runtime + '\nglobalThis.load = __loadTurnstile;', context);
  const first = context.load();
  const rejected = assert.rejects(first, /Não foi possível carregar/);
  scripts[0].onerror();
  await rejected;
  const retry = context.load();
  scripts[0].onerror();
  assert.equal(context.load(), retry, 'evento antigo preserva a promessa compartilhada atual');
  assert.equal(scripts.length, 2);
  context.window.turnstile = { render() {} };
  scripts[1].onload();
  assert.equal(await retry, context.window.turnstile);
  assert.equal(timers.size, 0);
});

test('erro tardio após sucesso não descarta carregamento já concluído', async () => {
  let script;
  const context = vm.createContext({
    window: {},
    document: {
      createElement: () => ({ remove() {} }),
      head: {
        append: (value) => {
          script = value;
        },
      },
    },
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(runtime + '\nglobalThis.load = __loadTurnstile;', context);
  const first = context.load();
  context.window.turnstile = { render() {} };
  script.onload();
  await first;
  script.onerror();
  assert.equal(vm.runInContext('__turnstileLoading', context), first);
});
