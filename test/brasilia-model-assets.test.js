import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectGlb } from '../scripts/import-brasilia-assets.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(
  readFileSync(path.join(root, 'data/brasilia-model-assets.json'), 'utf8'),
);
const publicFile = (p) => path.join(root, 'public', p);
function fixture(gltf) {
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const result = Buffer.alloc(20 + json.length);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(json.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  json.copy(result, 20);
  return result;
}

test('inventário de Brasília conserva SHA256 e tamanho de todos os arquivos públicos importados', () => {
  assert.equal(manifest.models.filter((m) => m.category === 'building').length, 13);
  assert.equal(new Set(manifest.files.map((f) => f.path)).size, manifest.files.length);
  let total = 0;
  for (const asset of manifest.files) {
    assert.ok(asset.path.startsWith('/assets/brasilia/'));
    const bytes = readFileSync(publicFile(asset.path));
    assert.equal(bytes.length, asset.bytes, asset.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.path);
    assert.equal(asset.source, asset.path);
    total += bytes.length;
  }
  assert.equal(total, manifest.totalBytes);
  assert.ok(
    total < 60 * 1024 * 1024,
    'modelo de importação deve continuar leve sem terrain/duplicatas',
  );
});

test('GLBs comprimidos têm todas as texturas locais e AABBs finitas calculadas da cena', () => {
  const indexed = new Set(manifest.files.map((f) => f.path));
  for (const model of manifest.models) {
    const actual = inspectGlb(readFileSync(publicFile(model.path)));
    assert.deepEqual(actual.bounds, model.bounds, model.id);
    assert.deepEqual(actual.componentBounds, model.componentBounds, model.id);
    assert.ok(actual.extensions.includes('KHR_draco_mesh_compression'), model.id);
    assert.ok(
      model.bounds.size.every((n) => Number.isFinite(n) && n > 0),
      model.id,
    );
    const resolved = actual.uris.map((uri) =>
      path.posix.normalize(path.posix.join(path.posix.dirname(model.path), uri)),
    );
    assert.deepEqual(resolved, model.dependencies, model.id);
    for (const dependency of resolved)
      assert.ok(indexed.has(dependency), `${model.id}: ${dependency}`);
  }
  assert.ok(
    manifest.models.find((m) => m.id === 'planalto').bounds.center[2] < -20,
    'não presumir centro geométrico na origem',
  );
  assert.ok(
    manifest.models.find((m) => m.id === 'stf').bounds.min[1] < -3,
    'preservar subsolo do STF no inventário',
  );
});

test('importação preserva créditos/licenças e exclui terreno global e modelos base duplicados', () => {
  const credits = JSON.parse(readFileSync(publicFile(manifest.creditsPath), 'utf8'));
  assert.equal(credits.decoder.license, 'Apache-2.0');
  assert.equal(credits.materials.license, 'CC0');
  for (const license of credits.decoder.licenseFiles)
    assert.ok(readFileSync(publicFile(`/assets/brasilia/${license}`)).length > 1000);
  for (const file of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'])
    assert.ok(readFileSync(publicFile(manifest.decoderPath + file)).length > 10000);
  assert.equal(
    manifest.files.some((f) => f.path.includes('terrain')),
    false,
  );
  assert.equal(
    manifest.files.some((f) => f.path.includes('/brasilia/buildings/')),
    false,
  );
  assert.deepEqual(
    readdirSync(publicFile('/assets/brasilia/compressed/buildings')).sort(),
    manifest.models
      .filter((m) => m.category === 'building')
      .map((m) => `${m.id}.glb`)
      .sort(),
  );
});

test('medidor AABB considera rotação, escala, translação e hierarquia sem executar o modelo', () => {
  const gltf = {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [
      { translation: [10, 20, 30], children: [1] },
      { rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], scale: [2, 3, 4], mesh: 0 },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ min: [-1, 0, -2], max: [1, 2, 2] }],
  };
  assert.deepEqual(inspectGlb(fixture(gltf)).bounds, {
    min: [2, 20, 28],
    max: [18, 26, 32],
    size: [16, 6, 4],
    center: [10, 23, 30],
  });
});

test('medidor rejeita cabeçalho e POSITION sem limites', () => {
  assert.throws(() => inspectGlb(Buffer.alloc(24)), /GLB v2 inválido/);
  assert.throws(
    () =>
      inspectGlb(
        fixture({
          nodes: [{ mesh: 0 }],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
          accessors: [{}],
        }),
      ),
    /POSITION sem AABB/,
  );
});

test('decoder Draco WASM oficial decodifica os 13 edifícios com faces e posições reais', async () => {
  const { createDecoder, decodeGlb } = await import('../scripts/inspect-brasilia-draco.mjs');
  const decoder = await createDecoder();
  let faces = 0;
  for (const model of manifest.models.filter((m) => m.category === 'building')) {
    const bytes = readFileSync(publicFile(model.path));
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
    const meshes = decodeGlb(decoder, bytes);
    assert.equal(
      meshes.length,
      gltf.meshes.reduce((count, m) => count + m.primitives.length, 0),
      model.id,
    );
    for (const mesh of meshes) {
      const primitive = gltf.meshes[mesh.mesh].primitives[mesh.primitive];
      assert.equal(
        mesh.points,
        gltf.accessors[primitive.attributes.POSITION].count,
        `${model.id}/${mesh.name}`,
      );
      assert.equal(
        mesh.faces * 3,
        gltf.accessors[primitive.indices].count,
        `${model.id}/${mesh.name}`,
      );
      faces += mesh.faces;
    }
  }
  assert.ok(faces > 100000, 'todos os modelos devem ter geometria real e não placeholders');
});
