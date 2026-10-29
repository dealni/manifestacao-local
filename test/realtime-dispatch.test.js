import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchPlayerMessage } from '../src/realtime-actions.js';

test('tipos herdados de Object.prototype seguem o fallback de mensagens desconhecidas', () => {
  for (const type of ['constructor', 'toString', '__proto__']) {
    const ctx = { state: {} };
    const player = { id: 1 };
    const runtime = {
      ctx,
      allow: () => true,
      presence: {
        active() {
          assert.fail('Tipo desconhecido não marca atividade.');
        },
      },
    };
    dispatchPlayerMessage(runtime, { player, ws: {} }, { t: type });
    assert.ok(ctx.state.world, `${type} deve atravessar os handlers de domínio`);
    assert.deepEqual(player, { id: 1 });
  }
});
