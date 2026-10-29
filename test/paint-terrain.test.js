import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { extractPaintTerrain } from '../scripts/prepare-paint-terrain.js';
import { paintGroundHeight } from '../src/paint-terrain.js';
import { brasiliaLayout } from '../src/brasilia-layout.js';
const client = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const data = JSON.parse(
  fs.readFileSync(new URL('../src/paint-terrain.json', import.meta.url), 'utf8'),
);
function declaration(name) {
  const start = client.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  return client.slice(start, client.indexOf('\n}', start) + 2);
}
const reference = vm.runInNewContext(
  `(()=>{
 const io=${JSON.stringify(data.segments)},Pn=${JSON.stringify(data.platforms)},Ba={deck:${data.params.deckHeight},stairsRun:${data.params.stairsRun}},ht=${JSON.stringify(brasiliaLayout.bounds)};
 const so=${JSON.stringify(data.vertical)},uo=${JSON.stringify(data.horizontal)},_t=${data.params.avenueHalf},Mn=${data.params.curbHeight},H4=${data.params.cornerRadius};
 const Hu=(r,x,z)=>x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1;
 ${declaration('N4')}
 ${client.slice(client.indexOf('const Do = 32,'), client.indexOf('const n0 = [-125,'))}
 ${declaration('q2')}
 ${client.slice(client.indexOf('const fk = so.filter('), client.indexOf('const lx = { id:'))}
 ${declaration('zo')}
 return bt;
})()`,
  {},
  { timeout: 1000 },
);

test('catálogo geométrico de pintura reproduz exatamente os trechos conhecidos do build', () => {
  assert.deepEqual(extractPaintTerrain(client), data);
  assert.throws(() => extractPaintTerrain(client.replace('  IC = [', '  REMOVED = [')), /ausente/);
  assert.throws(() => extractPaintTerrain(client.replace('z: -1085.74,', '')), /horizontal.z/);
  assert.throws(
    () => extractPaintTerrain(client.replace('half: 5.35,', 'half: 0,')),
    /Domínio geométrico/,
  );
  assert.throws(
    () => extractPaintTerrain(client.replace('at: t + g * u', 'at: undefined')),
    /platform.foot.at/,
  );
  assert.throws(
    () =>
      extractPaintTerrain(client.replace('axis: "x", at: t + g * u', 'axis: "y", at: t + g * u')),
    /platform.foot.axis/,
  );
  assert.throws(() => extractPaintTerrain(client.replace('deck: 4.18,', '')), /params.deckHeight/);
});

test('altura pura coincide com bt original no mapa, ruas, curvas, meio-fio, plataformas e escadas', () => {
  const points = [];
  for (let x = -260; x <= 260; x += 13) for (let z = -640; z <= 640; z += 16) points.push([x, z]);
  // Amostrar ambos os lados e o limite de cada meio-fio, inclusive cruzamentos arredondados.
  for (const road of data.horizontal)
    for (const offset of [-0.01, 0, 0.01])
      points.push([(road.x0 + road.x1) / 2, road.z + road.half + offset]);
  for (const road of data.vertical)
    for (const offset of [-0.01, 0, 0.01])
      points.push([road.x + road.half + offset, (road.z0 + road.z1) / 2]);
  for (const r of data.segments) {
    points.push([(r.ax + r.bx) / 2, (r.az + r.bz) / 2]);
  }
  for (const p of data.platforms) {
    for (const rect of [p.deck, p.stairs])
      for (let t = 0; t <= 10; t++)
        points.push([rect.x0 + ((rect.x1 - rect.x0) * t) / 10, (rect.z0 + rect.z1) / 2]);
  }
  let street = 0,
    curb = 0,
    raised = 0;
  for (const [x, z] of points) {
    const actual = paintGroundHeight(x, z),
      expected = reference(x, z);
    assert.equal(actual, expected, `${x},${z}`);
    if (actual === 0) street++;
    else if (actual === 0.15) curb++;
    else raised++;
  }
  assert.ok(street > 100 && curb > 100 && raised > 10);
});
