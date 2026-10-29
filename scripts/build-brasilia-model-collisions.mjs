import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDecoder, decodeGlb } from './inspect-brasilia-draco.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Envelope estático por altura e setor, calculado dos vértices reais do GLB público. */
export function buildAirSolids(m, asset, meshes) {
  const id = m.id;
  const bins = new Map(),
    step = 2;
  for (const mesh of meshes) {
    const component = asset.componentBounds.find((c) => c.mesh === mesh.mesh),
      matrix = component?.matrix ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const p of mesh.vertices) {
      const xyz = [0, 1, 2].map(
        (k) => matrix[k] * p[0] + matrix[4 + k] * p[1] + matrix[8 + k] * p[2] + matrix[12 + k],
      );
      const x = (xyz[0] - m.bounds.center[0]) * m.scale,
        y = (xyz[1] - m.bounds.min[1]) * m.scale,
        z = (xyz[2] - m.bounds.center[2]) * m.scale;
      const band = Math.floor(Math.max(0, y) / step),
        sector =
          id === 'catedral'
            ? Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 16) % 16
            : xyz[0] < -30
              ? 0
              : xyz[0] < 0
                ? 1
                : xyz[0] < 30
                  ? 2
                  : 3,
        key = `${band}:${sector}`;
      let a = bins.get(key);
      if (!a) {
        a = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], band };
        bins.set(key, a);
      }
      for (let k = 0; k < 3; k++) {
        a.min[k] = Math.min(a.min[k], [x, y, z][k]);
        a.max[k] = Math.max(a.max[k], [x, y, z][k]);
      }
    }
  }
  return [...bins.values()].map((a) => ({
    x: (a.min[0] + a.max[0]) / 2,
    z: (a.min[2] + a.max[2]) / 2,
    w: Math.max(0.05, a.max[0] - a.min[0]) + 0.05,
    d: Math.max(0.05, a.max[2] - a.min[2]) + 0.05,
    y: Math.max(0, a.min[1] - 0.025),
    h: Math.max(0.05, a.max[1] - a.min[1]) + 0.05,
  }));
}

export async function rebuildModelCollisions({ check = false } = {}) {
  const file = path.join(root, 'data/brasilia-layout.json');
  const layout = JSON.parse(fs.readFileSync(file));
  const assets = JSON.parse(fs.readFileSync(path.join(root, 'data/brasilia-model-assets.json')));
  const decoder = await createDecoder();
  const results = [];
  for (const id of ['catedral', 'congresso']) {
    const model = layout.models.find((m) => m.id === id),
      asset = assets.models.find((m) => m.id === id);
    const meshes = decodeGlb(decoder, fs.readFileSync(path.join(root, 'public', asset.path)), {
      components: true,
    });
    const solids = buildAirSolids(model, asset, meshes);
    if (check && JSON.stringify(solids) !== JSON.stringify(model.airSolids))
      throw new Error(`Colisões aéreas desatualizadas: ${id}`);
    model.airSolids = solids;
    results.push({ id, volumes: solids.length });
  }
  // Não altera lotes, coordenadas, IDs de superfícies ou sólidos pedestres da Catedral.
  if (!check) fs.writeFileSync(file, JSON.stringify(layout, null, 2) + '\n');
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check'))
    throw new Error('Uso: node scripts/build-brasilia-model-collisions.mjs [--check]');
  console.log(JSON.stringify(await rebuildModelCollisions({ check: args.includes('--check') })));
}
