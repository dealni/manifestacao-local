import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { requireServedArtifact } from './helpers/served-artifact.js';

const source = requireServedArtifact(
  readFileSync(new URL('../public/client.js', import.meta.url), 'utf8'),
  'const __authSnapshotEpochs = new WeakMap();',
  '__authTagSnapshot(i?.account, __epoch);',
  'if (__epoch !== __authIdentityEpoch) return a.design;',
);
function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const asyncStart = source.slice(start - 6, start) === 'async ' ? start - 6 : start;
  return source.slice(asyncStart, source.indexOf('\n}', start) + 2);
}
function fixture() {
  const responses = [];
  const context = vm.createContext({
    xt: { user: { id: 'old', nick: 'Antigo' }, ticket: 'old-ticket' },
    cn: true,
    an: '/api/game',
    vd: null,
    Ux: [],
    iy() {},
    A_() {},
    XB: async (_path, body) => body,
    $B: (_path, options) => options,
    fetch: () =>
      new Promise((resolve) =>
        responses.push((body) =>
          resolve({
            ok: true,
            json: async () => body,
          }),
        ),
      ),
  });
  vm.runInContext(
    source.slice(
      source.indexOf('let __authIdentityEpoch = 0;'),
      source.indexOf('function __authTagSnapshot('),
    ) + ['__authTagSnapshot', 'ts', 'qt', 'Ds', 'tr', 'hy', 'ey', 'ty'].map(declaration).join('\n'),
    context,
  );
  return { context, responses };
}

test('snapshots de conta pendentes antes do logout não restauram sessão nem ticket', async () => {
  for (const name of ['Ds', 'tr', 'hy']) {
    const { context, responses } = fixture();
    const pending = context[name]();
    context.ts({ user: null, ticket: null });
    responses.shift()({ user: { id: 'old' }, ticket: 'revoked' });
    await pending;
    assert.equal(context.xt.user, null, name);
    assert.equal(context.xt.ticket, null, name);
  }
});

test('conta embutida em exclusão não sobrescreve nova identidade', async () => {
  const { context, responses } = fixture();
  const pending = context.ty('design-old');
  await new Promise(setImmediate);
  context.ts({ user: { id: 'new', nick: 'Nova' }, ticket: 'new-ticket' });
  responses.shift()({ account: { user: { id: 'old' }, ticket: 'revoked' } });
  await pending;
  assert.equal(context.xt.user.id, 'new');
  assert.equal(context.xt.ticket, 'new-ticket');
});

test('upload pendente após logout não aplica conta retornada nem inicia atualização extra', async () => {
  for (const withAccount of [true, false]) {
    const { context, responses } = fixture();
    const pending = context.ey({ type: 'image/png' }, 'cartaz', 'Exemplo');
    context.ts({ user: null, ticket: null });
    responses.shift()({
      design: { id: 'design' },
      ...(withAccount ? { account: { user: { id: 'old' } } } : {}),
    });
    assert.equal((await pending).id, 'design');
    assert.equal(context.xt.user, null);
    assert.equal(responses.length, 0);
  }
});

test('atualizações da identidade atual continuam aplicadas e login novo atualiza normalmente', async () => {
  const { context, responses } = fixture();
  const pending = context.hy();
  responses.shift()({ user: { id: 'old', nick: 'Atualizado' }, ticket: 'fresh' });
  await pending;
  assert.equal(context.xt.user.nick, 'Atualizado');
  context.ts({ user: null, ticket: null });
  const login = context.hy();
  responses.shift()({ user: { id: 'new', nick: 'Nova' }, ticket: 'new' });
  await login;
  assert.equal(context.xt.user.id, 'new');
  assert.equal(context.xt.ticket, 'new');
});
