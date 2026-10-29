import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkGenerated, generatedFiles } from '../scripts/quality/check-generated.mjs';

async function fixture(t, { unstable = false, omitted = '' } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'manifestacao-generated-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(
    ['scripts', 'src', 'analysis', 'data', 'public/assets', 'node_modules'].map((name) =>
      mkdir(path.join(root, name), { recursive: true }),
    ),
  );
  const files = {
    'package.json': '{"type":"module"}',
    'analysis/original-index.html': '<html>fonte</html>',
    'data/media-screens.json': '[]',
    'data/brasilia-layout.json': '{}',
    'data/music-tracks.json': '[]',
    'public/local.css': 'body { margin: 0; }',
    'public/assets/source.js': 'fonte preservada',
    ...Object.fromEntries(generatedFiles.map((name) => [name, `gerado:${name}`])),
    'scripts/prepare-client.js': `
      import { existsSync, readFileSync, writeFileSync } from 'node:fs';
      const files = ${JSON.stringify(generatedFiles)};
      for (const name of files) {
        if (existsSync(name)) throw new Error('Saída reutilizada: ' + name);
      }
      const count = existsSync('.runs') ? Number(readFileSync('.runs', 'utf8')) + 1 : 1;
      writeFileSync('.runs', String(count));
      for (const name of files) {
        if (name === ${JSON.stringify(omitted)}) continue;
        writeFileSync(name, 'gerado:' + name + (${unstable} && count > 1 ? ':instável' : ''));
      }
    `,
  };
  await Promise.all(
    Object.entries(files).map(([name, content]) => writeFile(path.join(root, name), content)),
  );
  return { root, files };
}

async function assertUnchanged(root, files) {
  for (const [name, content] of Object.entries(files)) {
    assert.equal(
      await readFile(path.join(root, name), 'utf8'),
      content,
      `Checkout alterado: ${name}`,
    );
  }
}

test('gate confere os quatro artefatos em duas gerações limpas sem alterar o checkout', async (t) => {
  const { root, files } = await fixture(t);
  assert.deepEqual(await checkGenerated({ root }), generatedFiles);
  await assertUnchanged(root, files);
});

test('gate rejeita drift sem corrigir o arquivo servido', async (t) => {
  const { root, files } = await fixture(t);
  files['public/index.html'] = 'artefato antigo';
  await writeFile(path.join(root, 'public/index.html'), files['public/index.html']);
  await assert.rejects(checkGenerated({ root }), /Artefatos desatualizados: public\/index\.html/);
  await assertUnchanged(root, files);
});

test('gate rejeita resultado diferente na segunda geração', async (t) => {
  const { root, files } = await fixture(t, { unstable: true });
  await assert.rejects(checkGenerated({ root }), /Geração não determinística: public\/client\.js/);
  await assertUnchanged(root, files);
});

test('gate rejeita saída omitida pelo gerador mesmo quando existe no checkout', async (t) => {
  const { root, files } = await fixture(t, { omitted: 'src/paint-terrain.json' });
  await assert.rejects(
    checkGenerated({ root }),
    /Artefato gerado ausente: src\/paint-terrain\.json/,
  );
  await assertUnchanged(root, files);
});

test('gerador não herda configuração de produção nem opções de bootstrap do Node', async (t) => {
  const { root, files } = await fixture(t);
  const sentinels = {
    DATABASE_URL: 'postgresql://fixture.invalid/private',
    DATA_DIR: '/fixture/private-data',
    CLOUDFLARE_EMAIL_API_TOKEN: 'fixture-only-token',
    NODE_OPTIONS: '--import=/fixture/private-bootstrap.mjs',
    NODE_V8_COVERAGE: path.join(root, 'inherited-coverage'),
  };
  const previous = Object.fromEntries(Object.keys(sentinels).map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, sentinels);
  const script = 'scripts/prepare-client.js';
  files[script] = `
    for (const key of ${JSON.stringify(Object.keys(sentinels))}) {
      if (process.env[key] !== undefined) throw new Error('Ambiente herdado: ' + key);
    }
    ${files[script]}
  `;
  await writeFile(path.join(root, script), files[script]);
  assert.deepEqual(await checkGenerated({ root }), generatedFiles);
  await assert.rejects(stat(sentinels.NODE_V8_COVERAGE), { code: 'ENOENT' });
  await assertUnchanged(root, files);
});
