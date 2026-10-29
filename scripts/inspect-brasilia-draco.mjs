import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { inspectGlb } from './import-brasilia-assets.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
export async function createDecoder() {
  const filename = path.join(root, 'public/assets/brasilia/draco-r180/draco_wasm_wrapper.js');
  const wrapper = new Module(filename + '.cjs');
  wrapper.filename = filename + '.cjs';
  wrapper.paths = Module._nodeModulePaths(path.dirname(filename));
  wrapper._compile(fs.readFileSync(filename, 'utf8'), filename + '.cjs');
  return await wrapper.exports({
    wasmBinary: fs.readFileSync(path.join(path.dirname(filename), 'draco_decoder.wasm')),
  });
}
function destroyOptional(decoderModule, resources) {
  for (const resource of resources) if (resource) decoderModule.destroy(resource);
}

export function decodeGlb(decoderModule, bytes, { components = false } = {}) {
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  const binOffset = 20 + bytes.readUInt32LE(12) + 8;
  const bounds = inspectGlb(bytes).componentBounds;
  const output = [];
  for (let meshIndex = 0; meshIndex < gltf.meshes.length; meshIndex++)
    for (const [primitiveIndex, p] of gltf.meshes[meshIndex].primitives.entries()) {
      const draco = p.extensions?.KHR_draco_mesh_compression;
      if (!draco) continue;
      const view = gltf.bufferViews[draco.bufferView];
      const data = bytes.subarray(
        binOffset + (view.byteOffset ?? 0),
        binOffset + (view.byteOffset ?? 0) + view.byteLength,
      );
      const decoder = new decoderModule.Decoder(),
        buffer = new decoderModule.DecoderBuffer(),
        mesh = new decoderModule.Mesh();
      let status, positions, face;
      try {
        buffer.Init(new Int8Array(data), data.length);
        status = decoder.DecodeBufferToMesh(buffer, mesh);
        if (!status.ok() || mesh.num_points() < 1 || mesh.num_faces() < 1)
          throw new Error('Falha Draco: ' + status.error_msg());
        const info = bounds.find((b) => b.mesh === meshIndex);
        const result = {
          mesh: meshIndex,
          primitive: primitiveIndex,
          name: info?.name,
          points: mesh.num_points(),
          faces: mesh.num_faces(),
          bounds: info?.bounds,
        };
        if (components) {
          positions = new decoderModule.DracoFloat32Array();
          decoder.GetAttributeFloatForAllPoints(
            mesh,
            decoder.GetAttributeByUniqueId(mesh, draco.attributes.POSITION),
            positions,
          );
          const vertices = Array.from({ length: mesh.num_points() }, (_, i) => [
            positions.GetValue(i * 3),
            positions.GetValue(i * 3 + 1),
            positions.GetValue(i * 3 + 2),
          ]);
          const parents = Int32Array.from({ length: mesh.num_points() }, (_, i) => i);
          function find(i) {
            while (parents[i] !== i) {
              parents[i] = parents[parents[i]];
              i = parents[i];
            }
            return i;
          }
          function join(a, b) {
            parents[find(a)] = find(b);
          }
          face = new decoderModule.DracoInt32Array();
          for (let i = 0; i < mesh.num_faces(); i++) {
            decoder.GetFaceFromMesh(mesh, i, face);
            join(face.GetValue(0), face.GetValue(1));
            join(face.GetValue(1), face.GetValue(2));
          }
          const groups = new Map();
          for (let i = 0; i < vertices.length; i++) {
            const id = find(i);
            let group = groups.get(id);
            if (!group) {
              group = {
                count: 0,
                min: [Infinity, Infinity, Infinity],
                max: [-Infinity, -Infinity, -Infinity],
              };
              groups.set(id, group);
            }
            group.count++;
            const matrix = info?.matrix;
            const v = vertices[i];
            const transformed = matrix
              ? [0, 1, 2].map(
                  (k) =>
                    matrix[k] * v[0] + matrix[4 + k] * v[1] + matrix[8 + k] * v[2] + matrix[12 + k],
                )
              : v;
            for (let k = 0; k < 3; k++) {
              group.min[k] = Math.min(group.min[k], transformed[k]);
              group.max[k] = Math.max(group.max[k], transformed[k]);
            }
          }
          result.connectedComponents = [...groups.values()].map((g) => ({
            ...g,
            size: g.max.map((v, i) => v - g.min[i]),
          }));
          // Coordinates are public mesh geometry; output only on explicit analysis request.
          result.vertices = vertices;
        }
        output.push(result);
      } finally {
        destroyOptional(decoderModule, [face, positions, status]);
        decoderModule.destroy(mesh);
        decoderModule.destroy(buffer);
        decoderModule.destroy(decoder);
      }
    }
  return output;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const decoder = await createDecoder();
  const names = process.argv.slice(2).length ? process.argv.slice(2) : ['catedral', 'congresso'];
  const folder = path.join(root, 'analysis/brasilia-model-geometry');
  fs.mkdirSync(folder, { recursive: true });
  for (const name of names) {
    const output = decodeGlb(
      decoder,
      fs.readFileSync(path.join(root, `public/assets/brasilia/compressed/buildings/${name}.glb`)),
      { components: true },
    );
    fs.writeFileSync(path.join(folder, name + '.json'), JSON.stringify(output));
    console.log(
      name,
      output.map((x) => ({
        mesh: x.mesh,
        points: x.points,
        components: x.connectedComponents.length,
      })),
    );
  }
}
