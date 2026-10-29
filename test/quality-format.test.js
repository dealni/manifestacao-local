import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectFormatTargets, formatSources } from '../scripts/quality/format.mjs';

test('formatação limita-se às fontes próprias, inclusive com caminhos explícitos', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'manifestacao-format-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixtures = {
    'src/main.js': 'const x={a:1};\n',
    'tsconfig.checkjs.json': '{"compilerOptions":{"checkJs":true}}\n',
    'types/protocol.d.ts': 'export interface Packet{type:string}\n',
    'types/contracts.test.ts': 'const contract:number=1;\n',
    'scripts/quality/new-gate.ts': 'export const limit:number=300;\n',
    'scripts/quality/nested/tool.mjs': 'export const y=2;\n',
    'public/local.css': '.game{color:red}\n',
    'public/local-compat.js': 'window.example=1;\n',
    'public/client.js': 'const generated={a:1};\n',
    'public/assets/vendor.js': 'const vendor={a:1};\n',
    'scripts/vendor/lib.js': 'const vendor={a:1};\n',
    'analysis/client-readable.js': 'const original={a:1};\n',
    'src/paint-terrain.json': '{"generated":true}\n',
    'data/state.json': '{"private":true}\n',
  };
  for (const [name, content] of Object.entries(fixtures)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  const expected = [
    'public/local-compat.js',
    'public/local.css',
    'scripts/quality/nested/tool.mjs',
    'scripts/quality/new-gate.ts',
    'src/main.js',
    'tsconfig.checkjs.json',
    'types/contracts.test.ts',
    'types/protocol.d.ts',
  ];
  assert.deepEqual(await collectFormatTargets(root), expected);
  assert.deepEqual(
    await collectFormatTargets(root, [...Object.keys(fixtures), '../outside.js', 'src/main.js']),
    expected,
  );
  const checked = await formatSources({ root });
  assert.equal(checked.changed.length, expected.length);
  assert.equal(await readFile(path.join(root, 'src/main.js'), 'utf8'), fixtures['src/main.js']);
  await formatSources({ root, write: true });
  assert.deepEqual((await formatSources({ root })).changed, []);
  for (const name of Object.keys(fixtures).filter((name) => !expected.includes(name))) {
    assert.equal(await readFile(path.join(root, name), 'utf8'), fixtures[name]);
  }
});
