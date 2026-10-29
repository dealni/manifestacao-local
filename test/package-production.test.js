import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectReleaseFiles, packageProduction } from '../scripts/package-production.mjs';

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'manifestacao-package-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'project');
  for (const dir of ['data', 'src', 'public', 'deploy'])
    await mkdir(path.join(root, dir), { recursive: true });
  for (const file of [
    'package.json',
    'package-lock.json',
    'data/catalog.json',
    'data/media-screens.json',
    'data/brasilia-layout.json',
    'data/brasilia-model-assets.json',
    'data/music-tracks.json',
  ]) {
    await writeFile(path.join(root, file), '{}');
  }
  for (const file of ['src/server.js', 'public/client.js', 'deploy/README.md', 'deploy/nginx.conf'])
    await writeFile(path.join(root, file), file);
  return { root, base };
}

test('pacote inclui documentação operacional e exclui dados privados e testes', async (t) => {
  const { root, base } = await fixture(t);
  for (const file of ['data/state.json', 'public/.env', 'deploy/.env.secret'])
    await writeFile(path.join(root, file), 'privado');
  await mkdir(path.join(root, 'public/uploads'));
  await writeFile(path.join(root, 'public/uploads/user.png'), 'privado');
  const entries = await collectReleaseFiles(root);
  assert(entries.includes('deploy/README.md'));
  assert(entries.includes('data/brasilia-model-assets.json'));
  assert(entries.includes('data/music-tracks.json'));
  assert(!entries.some((entry) => /state|\.env|uploads/.test(entry)));
  const output = path.join(base, 'release.tar.gz');
  const result = await packageProduction(output, root);
  assert.equal(result.files, entries.length);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  const listing = spawnSync('tar', ['-tzf', output], { encoding: 'utf8' });
  assert.equal(listing.status, 0);
  assert.deepEqual(listing.stdout.trim().split('\n').sort(), entries);
  await assert.rejects(packageProduction(output, root), /já existe/);
  assert((await readFile(output)).length > 0);
  await assert.rejects(
    packageProduction(path.join(root, 'release.tar.gz'), root),
    /fora do projeto/,
  );
});

test('pacote rejeita symlink de arquivo e de diretório pai dos catálogos', async (t) => {
  const { root, base } = await fixture(t);
  await symlink(path.join(root, 'package.json'), path.join(root, 'public/linked.json'));
  await assert.rejects(collectReleaseFiles(root), /Link simbólico/);
  await rm(path.join(root, 'public/linked.json'));
  await rename(path.join(root, 'data'), path.join(base, 'external-data'));
  await symlink(path.join(base, 'external-data'), path.join(root, 'data'));
  await assert.rejects(collectReleaseFiles(root), /Link simbólico não permitido: data/);
});
