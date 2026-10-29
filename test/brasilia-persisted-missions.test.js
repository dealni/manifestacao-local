import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initWorld, handleWorldMessage } from '../src/world-actions.js';

const { missions } = JSON.parse(
  readFileSync(new URL('../src/world-data.json', import.meta.url), 'utf8'),
);

function fixture() {
  const saved = {
    secret: { coins: 31, hp: 87, ready: { fountain: 1234 } },
    mission: {
      revision: 7,
      index: 1,
      counts: { walk: 18, activeMs: 1000 },
      completed: [{ id: missions[0].id, at: 1234, reward: missions[0].reward }],
      starter: true,
      starterLabel: 'Itens liberados no modo local',
      catalog: [{ ...missions[0], title: 'Além da Paulista' }],
    },
    areas: ['g0.25.12'],
    marks: ['w0.0'],
  };
  const messages = [];
  const player = { id: 17, user: { id: 'conta-ficticia' }, team: 1, x: 0, z: 0 };
  const ctx = {
    state: { world: { progress: { 'conta-ficticia': saved } } },
    players: new Map([[player.id, player]]),
    save() {},
    sendPlayer(_player, message) {
      messages.push(structuredClone(message));
    },
  };
  const { catalog, ...advance } = structuredClone(saved.mission);
  const expected = { ...structuredClone(saved), mission: advance };
  return { saved, messages, player, ctx, expected };
}

function assertPreserved(f) {
  const { catalog, ...advance } = f.saved.mission;
  assert.deepEqual({ ...f.saved, mission: advance }, f.expected);
  assert.equal(catalog, undefined);
  assert.ok(!Object.hasOwn(JSON.parse(JSON.stringify(f.saved.mission)), 'catalog'));
  // O catálogo atualizado segue nas respostas, sem repetir metadados no banco.
}

test('entrada renova catálogo antigo de Brasília sem reiniciar o progresso persistido', () => {
  const f = fixture();
  const welcome = initWorld(f.player, f.ctx);
  assertPreserved(f);
  assert.deepEqual(welcome.secretProgress, f.expected.secret);
  handleWorldMessage(f.player, { t: 'missions' }, f.ctx);
  assertPreserved(f);
  assert.deepEqual(f.messages.at(-1).state.catalog, missions);
  assert.equal(f.messages.at(-1).state.catalog[0].title, 'Além do Eixo');
});

test('pedido de missões renova catálogo antigo mesmo sem passar pela entrada', () => {
  const f = fixture();
  assert.equal(handleWorldMessage(f.player, { t: 'missions' }, f.ctx), true);
  assertPreserved(f);
  assert.deepEqual(f.messages.at(-1).state, { ...f.expected.mission, catalog: missions });
});
