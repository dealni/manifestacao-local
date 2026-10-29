import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inspectGitContent,
  inspectGitPath,
  MAX_GIT_FILE_BYTES,
} from '../scripts/quality/git-content.mjs';

const fakeToken = ['ghp', '_', 'A'.repeat(36)].join('');
const stagedScript = fileURLToPath(new URL('../scripts/quality/check-staged.mjs', import.meta.url));

test('scanner detects credentials in ASCII even when binary bytes surround them', () => {
  for (const credential of [
    fakeToken,
    ['github_pat', '_', 'B'.repeat(60)].join(''),
    ['AKIA', 'C'.repeat(16)].join(''),
    ['-----BEGIN ', 'RSA PRIVATE KEY-----'].join(''),
  ]) {
    const issues = inspectGitContent(
      'example.bin',
      Buffer.concat([Buffer.from([0, 255]), Buffer.from(credential), Buffer.from([0])]),
    );
    assert.equal(issues[0]?.code, 'credential');
    assert.ok(!JSON.stringify(issues).includes(credential));
  }
});

test('scanner recognizes UTF-16LE/BE with and without BOM, including embedded text', () => {
  for (const endian of ['le', 'be']) {
    for (const prefix of [Buffer.alloc(0), Buffer.from([0, 1, 2])]) {
      for (const bom of [false, true]) {
        const encoded = Buffer.from(`${bom ? '\ufeff' : ''}token=${fakeToken}\n`, 'utf16le');
        if (endian === 'be') encoded.swap16();
        assert.equal(
          inspectGitContent('config.txt', Buffer.concat([prefix, encoded]))[0]?.code,
          'credential',
        );
      }
    }
  }
});

test('ordinary binary assets and allowed data do not trigger the scanner', () => {
  assert.deepEqual(
    inspectGitContent(
      'public/asset.glb',
      Buffer.from([103, 108, 84, 70, 0, 0, 0, 0, 255, 254, 0, 1]),
    ),
    [],
  );
  for (const name of [
    'data/catalog.json',
    'data/music-tracks.json',
    'data/media-screens.json',
    'data/brasilia-layout.json',
    'data/brasilia-model-assets.json',
  ]) {
    assert.deepEqual(inspectGitContent(name, Buffer.from('{}')), []);
    assert.equal(inspectGitContent(name, Buffer.from(fakeToken))[0]?.code, 'credential');
  }
});

test('private paths and large blobs remain forbidden before reading content', () => {
  for (const name of [
    '.env',
    'nested/.env.local',
    'uploads/a.png',
    'data/accounts.json',
    'snapshots/a.json',
    'node_modules/a.js',
    'backup.SQL',
    'private.pem',
    'archive.tar.gz',
  ]) {
    assert.equal(inspectGitPath(name, 0)[0]?.code, 'forbidden-path');
  }
  assert.deepEqual(inspectGitPath('public/asset.glb', MAX_GIT_FILE_BYTES - 1), []);
  assert.equal(inspectGitPath('public/asset.glb', MAX_GIT_FILE_BYTES)[0]?.code, 'oversized-file');
});

test('staged checker scans the index rather than working-tree replacements and omits credentials', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'manifestacao-secret-scan-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git(['init', '--quiet']);
  writeFileSync(
    join(cwd, 'example.txt'),
    Buffer.concat([Buffer.from([0]), Buffer.from(fakeToken)]),
  );
  git(['add', '--', 'example.txt']);
  writeFileSync(join(cwd, 'example.txt'), 'clean working tree');
  const result = spawnSync(process.execPath, [stagedScript], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Possível credencial/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(fakeToken));
  git(['add', '--', 'example.txt']);
  assert.equal(spawnSync(process.execPath, [stagedScript], { cwd }).status, 0);
});
