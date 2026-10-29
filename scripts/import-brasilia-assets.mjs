import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  return Array.from({ length: 16 }, (_, i) => {
    const r = i % 4,
      c = Math.floor(i / 4);
    return [0, 1, 2, 3].reduce((v, k) => v + a[k * 4 + r] * b[c * 4 + k], 0);
  });
}
function localMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1],
    [sx, sy, sz] = node.scale ?? [1, 1, 1],
    [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * y * y - 2 * z * z) * sx,
    (2 * x * y + 2 * z * w) * sx,
    (2 * x * z - 2 * y * w) * sx,
    0,
    (2 * x * y - 2 * z * w) * sy,
    (1 - 2 * x * x - 2 * z * z) * sy,
    (2 * y * z + 2 * x * w) * sy,
    0,
    (2 * x * z + 2 * y * w) * sz,
    (2 * y * z - 2 * x * w) * sz,
    (1 - 2 * x * x - 2 * y * y) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

/** Conservative world AABB from glTF accessor min/max; never executes asset code or decompresses Draco. */
export function inspectGlb(bytes) {
  if (
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    throw new Error('GLB v2 inválido');
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Chunk JSON ausente');
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity],
    componentBounds = [];
  const nodes = gltf.nodes ?? [],
    childIds = new Set(nodes.flatMap((n) => n.children ?? []));
  const roots =
    gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? nodes.map((_, i) => i).filter((i) => !childIds.has(i));
  function visit(id, parent, ancestors = new Set()) {
    if (ancestors.has(id)) throw new Error('Ciclo nos nodes glTF');
    const node = nodes[id];
    if (!node) throw new Error('Node inválido');
    const matrix = multiply(parent, localMatrix(node));
    for (const primitive of gltf.meshes?.[node.mesh]?.primitives ?? []) {
      const componentMin = [Infinity, Infinity, Infinity],
        componentMax = [-Infinity, -Infinity, -Infinity];
      const a = gltf.accessors?.[primitive.attributes?.POSITION];
      if (!a?.min || !a?.max) throw new Error('POSITION sem AABB');
      for (let corner = 0; corner < 8; corner++) {
        const p = [0, 1, 2].map((k) => (corner & (1 << k) ? a.max : a.min)[k]);
        for (let k = 0; k < 3; k++) {
          const v = matrix[k] * p[0] + matrix[4 + k] * p[1] + matrix[8 + k] * p[2] + matrix[12 + k];
          min[k] = Math.min(min[k], v);
          max[k] = Math.max(max[k], v);
          componentMin[k] = Math.min(componentMin[k], v);
          componentMax[k] = Math.max(componentMax[k], v);
        }
      }
      componentBounds.push({
        node: id,
        name: node.name ?? gltf.meshes[node.mesh].name ?? `node-${id}`,
        mesh: node.mesh,
        matrix,
        bounds: {
          min: componentMin,
          max: componentMax,
          size: componentMax.map((v, i) => v - componentMin[i]),
          center: componentMax.map((v, i) => (v + componentMin[i]) / 2),
        },
      });
    }
    const next = new Set(ancestors).add(id);
    for (const child of node.children ?? []) visit(child, matrix, next);
  }
  for (const root of roots) visit(root, identity());
  if (![...min, ...max].every(Number.isFinite)) throw new Error('AABB não finita');
  const round = (v) => Math.round(v * 1e6) / 1e6;
  return {
    componentBounds,
    bounds: {
      min: min.map(round),
      max: max.map(round),
      size: max.map((v, i) => round(v - min[i])),
      center: max.map((v, i) => round((v + min[i]) / 2)),
    },
    uris: [...(gltf.images ?? []), ...(gltf.buffers ?? [])].flatMap((item) =>
      item.uri && !item.uri.startsWith('data:') ? [item.uri] : [],
    ),
    extensions: gltf.extensionsUsed ?? [],
    meshCount: gltf.meshes?.length ?? 0,
  };
}

export function importBrasiliaAssets(source, repo) {
  const assetPrefix = 'assets/brasilia/';
  const buildings = [
    'biblioteca',
    'casa-cha',
    'catedral',
    'congresso',
    'itamaraty',
    'justica',
    'lucio-costa',
    'museu-cidade',
    'museu',
    'oscar-niemeyer',
    'panteao',
    'planalto',
    'stf',
  ];
  const selected = [
    ...buildings.map((id) => ['building', `compressed/buildings/${id}.glb`]),
    ...['candangos', 'a-justica', 'pombal', 'meteoro'].map((id) => [
      'monument',
      `compressed/monuments/${id}.glb`,
    ]),
    ...[
      'ministry-wing',
      'ministry-annex',
      'palmeira-imperial',
      'ipe-amarelo',
      'avenue-lamp',
      'civic-bench',
    ].map((id) => ['prop', `compressed/props/${id}-lod1.glb`]),
  ];
  const files = new Map(),
    models = [];
  function copy(relative, category) {
    if (files.has(relative)) return files.get(relative);
    if (relative.startsWith('../') || path.isAbsolute(relative))
      throw new Error('Dependência fora da raiz');
    const bytes = readFileSync(path.join(source, relative)),
      dest = path.join(repo, 'public', assetPrefix, relative);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(path.join(source, relative), dest);
    const entry = {
      path: `/${assetPrefix}${relative}`,
      source: `/${assetPrefix}${relative}`,
      category,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    files.set(relative, entry);
    return entry;
  }
  for (const [category, relative] of selected) {
    const metadata = inspectGlb(readFileSync(path.join(source, relative)));
    const dependencies = metadata.uris.map(
      (uri) =>
        copy(path.posix.normalize(path.posix.join(path.posix.dirname(relative), uri)), 'texture')
          .path,
    );
    models.push({
      ...copy(relative, category),
      id: path.basename(relative, '.glb'),
      bounds: metadata.bounds,
      componentBounds: metadata.componentBounds,
      meshCount: metadata.meshCount,
      extensions: metadata.extensions,
      dependencies,
    });
  }
  for (const name of [
    'draco_decoder.js',
    'draco_decoder.wasm',
    'draco_wasm_wrapper.js',
    'DRACO-LICENSE.txt',
    'LICENSE',
  ])
    copy(`draco-r180/${name}`, 'decoder');
  copy('CREDITS.json', 'credits');
  const manifest = {
    version: 1,
    source: 'captura pública incorporada; endereço externo omitido',
    extractedAt: '2026-10-18',
    description:
      'Modelos públicos de Brasília importados sem modificar os bytes originais. Terrain global e variantes base duplicadas excluídos; mapa local conserva 520 x 1280.',
    boundsMethod:
      'AABB conservadora dos accessors POSITION com transforms de nodes e hierarquia da cena glTF; não inclui deslocamento por shader.',
    decoderPath: '/assets/brasilia/draco-r180/',
    creditsPath: '/assets/brasilia/CREDITS.json',
    models,
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    totalBytes: [...files.values()].reduce((n, f) => n + f.bytes, 0),
  };
  writeFileSync(
    path.join(repo, 'data/brasilia-model-assets.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2])
    throw new Error('Uso: node scripts/import-brasilia-assets.mjs /caminho/site/assets/brasilia');
  const manifest = importBrasiliaAssets(
    path.resolve(process.argv[2]),
    path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  );
  console.log(
    JSON.stringify({
      models: manifest.models.length,
      files: manifest.files.length,
      totalBytes: manifest.totalBytes,
    }),
  );
}
