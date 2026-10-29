import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareBackupPolicy } from '../scripts/prepare-backup-policy.mjs';

function policy() {
  return {
    host: 'srv924325',
    localRetentionDays: 7,
    externalRetentionDays: 30,
    externalMinimumPerProfile: 3,
    minutobooksUploads: false,
    custom: { preserve: true },
    jobs: [{ unit: 'centersms-backup.service', maxAgeHours: 2, artifact: '/private/*.dump' }],
  };
}

test('cadastro local preserva política, não muta entrada e é idempotente', () => {
  const source = policy();
  const before = structuredClone(source);
  const candidate = prepareBackupPolicy(source);
  assert.deepEqual(source, before);
  assert.deepEqual({ ...candidate, jobs: candidate.jobs.slice(0, -1) }, source);
  assert.deepEqual(candidate.jobs.at(-1), {
    unit: 'manifestacao-backup.service',
    maxAgeHours: 26,
    artifact: '/var/backups/manifestacao-local/backup-????????T??????Z/SHA256SUMS',
  });
  assert.deepEqual(prepareBackupPolicy(candidate), candidate);
});

test('rejeita política malformada, host errado, duplicação e conflito existente', () => {
  for (const invalid of [null, {}, { ...policy(), host: 'srv1834794' }, { ...policy(), jobs: [] }])
    assert.throws(() => prepareBackupPolicy(invalid));
  const duplicated = policy();
  duplicated.jobs.push({ ...duplicated.jobs[0] });
  assert.throws(() => prepareBackupPolicy(duplicated), /duplicada/);
  for (const change of [{ maxAgeHours: '26' }, { maxAgeHours: -1 }, { artifact: 'relative' }]) {
    const invalid = policy();
    Object.assign(invalid.jobs[0], change);
    assert.throws(() => prepareBackupPolicy(invalid));
  }
  const conflict = prepareBackupPolicy(policy());
  conflict.jobs.at(-1).maxAgeHours = 48;
  assert.throws(() => prepareBackupPolicy(conflict), /diverge/);
});

test('CLI só emite candidata: não grava entrada e não vaza erro com conteúdo privado', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'manifestacao-backup-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = join(root, 'policy.json');
  const source = JSON.stringify(policy());
  writeFileSync(input, source);
  const script = new URL('../scripts/prepare-backup-policy.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname, input], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(readFileSync(input, 'utf8'), source);
  assert.deepEqual(JSON.parse(result.stdout), prepareBackupPolicy(policy()));
  writeFileSync(input, '{private-content');
  const failure = spawnSync(process.execPath, [script.pathname, input], { encoding: 'utf8' });
  assert.equal(failure.status, 1);
  assert.equal(failure.stdout, '');
  assert(!failure.stderr.includes('private-content'));
});
