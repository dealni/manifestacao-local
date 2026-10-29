import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { applyBrasiliaScene, brasiliaLayout } from '../scripts/brasilia-scene.js';
import { applyBrasiliaSpray } from '../scripts/brasilia-spray.js';

const original = fs.readFileSync(
  new URL('../analysis/client-readable.js', import.meta.url),
  'utf8',
);
const scene = applyBrasiliaScene(original);
const patched = applyBrasiliaSpray(scene);
const plain = (value) => JSON.parse(JSON.stringify(value));
function declaration(source, name, from = 0) {
  const start = source.indexOf(`function ${name}(`, from);
  assert.ok(start >= 0);
  const indent = source.slice(source.lastIndexOf('\n', start) + 1, start);
  return source.slice(start, source.indexOf(`\n${indent}}`, start) + indent.length + 2);
}
function consumer(source) {
  const start = source.indexOf('H1 = (() => {');
  const end = source.indexOf('\n  kr =', start);
  const operations = [];
  const scope = {
    HE: /const HE =\s*"([A-Za-z0-9+/=]+)"/.exec(source)[1],
    VE: Number(/\bVE = (\d+)/.exec(source)[1]),
    atob,
    Uint8Array,
    DataView,
    __brasiliaLayout: brasiliaLayout,
    Ot: 4,
    $S: 4,
    Mn: 0.15,
    mY: [0, 0.15],
    ht: brasiliaLayout.bounds,
    JS: 8,
    C4: (n) => Math.floor(n / 48),
    Jo: [0.1, 0.2, 0.36],
    // Terreno plano reconstruído no lote; sem obstáculos novos ou zona protegida.
    bt: () => 0.15,
    Q4: () => 0,
    ai: () => false,
    i0: () => 0,
    performance: { now: () => 1 },
    h: (...args) => operations.push(args),
  };
  vm.createContext(scope);
  // Decodificador, índice espacial, raycast, resolução e pintura reais do cliente.
  vm.runInContext(
    `
    const H1=${source.slice(start + 5, end).replace(/,\s*$/, '')};
    globalThis.walls=H1;
    const kr=16,S4=new Map(),KS=(n,e)=>(n+2048)*4096+(e+2048),c2=new Map();
    ${source.slice(source.indexOf('H1.forEach('), source.indexOf('const mY ='))}
    ${['Kl', 'gY', 'O2', 'xw', 'vY', 'wY', 'xY', 'yY'].map((name) => declaration(source, name)).join('\n')}
    ${declaration(source, 'A', source.indexOf('function RY('))}
  `,
    scope,
  );
  return { ...scope, operations };
}

test('mira ignora parede removida e permite tinta e borracha no chão atrás dela', () => {
  const before = consumer(scene),
    after = consumer(patched);
  const ray = [44.7, 1.15, 98.7, 1, -0.2, 0, 80, 44.7, 98.7];
  const ghost = before.xY(...ray);
  assert.equal(ghost.key, 'w8.2');
  assert.equal(before.Kl(ghost.key), null);
  assert.throws(() => before.xw(before.Kl(ghost.key), ghost.u, ghost.v, 0), /null/);
  const hit = after.xY(...ray);
  assert.equal(hit.key, 'g1.12.24');
  assert.ok(hit.t > ghost.t);
  assert.ok(after.Kl(hit.key));
  assert.equal(after.xw(after.Kl(hit.key), hit.u, hit.v, 0), false);
  for (const color of [2, 9]) {
    assert.doesNotThrow(() => after.A(hit, 0, color, 1));
    assert.ok(after.operations.some(([key, , op]) => key === hit.key && op.c === color));
  }
  assert.equal(after.xY(44.7, 1.15, 98.7, 1, 0, 0, 80, 44.7, 98.7), null);
});

test('índices, geometrias e mira das paredes retidas permanecem iguais', () => {
  const before = consumer(scene),
    after = consumer(patched);
  assert.deepEqual(plain(after.walls), plain(before.walls));
  let retained = 0;
  for (let i = 0; i < after.walls.length; i++) {
    const wall = after.walls[i];
    if (wall.disabled) continue;
    retained++;
    const key = `w${i}.0`;
    assert.deepEqual(plain(after.Kl(key)), plain(before.Kl(key)));
    const x = (wall.ax + wall.bx) / 2,
      z = (wall.az + wall.bz) / 2;
    const ray = [x + wall.nx * 0.01, 1.15, z + wall.nz * 0.01, -wall.nx, 0, -wall.nz, 0.02, x, z];
    const hit = after.xY(...ray);
    assert.deepEqual(plain(hit), plain(before.xY(...ray)));
    assert.ok(hit && after.Kl(hit.key));
  }
  assert.equal(retained, 5646);
});

test('patch de mira falha de forma assertiva quando ausente, duplicado ou reaplicado', () => {
  assert.throws(() => applyBrasiliaSpray(''), /incompatível/);
  assert.throws(() => applyBrasiliaSpray(scene + scene), /ambíguo/);
  assert.throws(() => applyBrasiliaSpray(patched), /incompatível/);
});
