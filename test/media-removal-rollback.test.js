import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleMedia } from '../src/media.js';
import { sessionRequest } from './session-fixture.js';

function setup(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-removal-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const design = {
    id: 'c0123456789abcde',
    filename: '0123456789abcdef01234567.png',
    userId: 'u1',
    kind: 'cartaz',
    paid: true,
    status: 'approved',
  };
  const appearance = (14 << 12) | (1 << 19);
  const user = {
    id: 'u1',
    design: design.id,
    visual: { design: design.id, appearance },
    appearance: { design: design.id, appearance },
  };
  const player = { userId: user.id, design: design.id, appearance };
  const ctx = {
    dataDir,
    config: { production: false },
    state: { users: [user], designs: [design] },
    players: new Map([['player', player]]),
    user: () => user,
    account: () => ({}),
    body: async () => ({ id: design.id }),
    save() {},
    refreshPlayerAppearance() {},
    send(res, status, payload) {
      Object.assign(res, { status, payload });
    },
  };
  fs.mkdirSync(path.join(dataDir, 'uploads'));
  const file = path.join(dataDir, 'uploads', design.filename);
  fs.writeFileSync(file, 'fixture');
  async function remove() {
    const res = {};
    await handleMedia(
      sessionRequest(ctx, { method: 'POST', headers: {} }),
      res,
      new URL('http://localhost/api/jogos/manifestacao/cartaz/excluir'),
      ctx,
    );
    return res;
  }
  return { ctx, user, player, design, appearance, file, remove };
}

for (const failure of ['save', 'flush']) {
  test(`falha de ${failure} na exclusão restaura design e aparência em todas as sessões`, async (t) => {
    const { ctx, user, player, design, appearance, file, remove } = setup(t);
    const reject = () => {
      throw Error('persistence unavailable');
    };
    if (failure === 'save') ctx.save = reject;
    else ctx.persistence = { flush: reject };
    assert.equal((await remove()).status, 500);
    assert.equal(ctx.state.designs[0], design);
    for (const holder of [user, user.visual, user.appearance, player])
      assert.equal(holder.design, design.id);
    for (const holder of [user.visual, user.appearance, player])
      assert.equal(holder.appearance, appearance);
    assert.equal(fs.existsSync(file), true);
  });
}

test('rollback não sobrescreve design ou aparência escolhidos durante a persistência', async (t) => {
  const { ctx, user, player, remove } = setup(t);
  let rejectFlush;
  ctx.persistence = {
    flush: () => new Promise((_, reject) => (rejectFlush = reject)),
  };
  const pending = remove();
  while (!rejectFlush) await new Promise((resolve) => setImmediate(resolve));
  for (const holder of [user, user.visual, user.appearance, player]) holder.design = 'new-design';
  player.appearance = 123;
  rejectFlush(Error('unavailable'));
  assert.equal((await pending).status, 500);
  for (const holder of [user, user.visual, user.appearance, player])
    assert.equal(holder.design, 'new-design');
  assert.equal(player.appearance, 123);
});

test('exclusão de cartaz sinaliza limpeza pendente se arquivo não puder ser removido', async (t) => {
  const { ctx, design, file, remove } = setup(t);
  ctx.persistence = {
    flush() {
      fs.unlinkSync(file);
      fs.mkdirSync(file);
      fs.writeFileSync(path.join(file, 'occupied'), 'fixture');
    },
  };
  const result = await remove();
  assert.equal(result.status, 200);
  assert.equal(result.payload.cleanupPending, true);
  assert.equal(ctx.state.designs.includes(design), false);
});
