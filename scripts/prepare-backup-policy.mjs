import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifestacaoJob = Object.freeze({
  unit: 'manifestacao-backup.service',
  maxAgeHours: 26,
  artifact: '/var/backups/manifestacao-local/backup-????????T??????Z/SHA256SUMS',
});

function validateJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) throw new Error('Política sem rotinas.');
  const units = new Set();
  for (const job of jobs) {
    if (
      !job ||
      typeof job.unit !== 'string' ||
      !/^[a-zA-Z0-9@_.-]+\.service$/.test(job.unit) ||
      units.has(job.unit) ||
      !Number.isFinite(job.maxAgeHours) ||
      job.maxAgeHours <= 0 ||
      typeof job.artifact !== 'string' ||
      !job.artifact.startsWith('/')
    )
      throw new Error('Rotina inválida ou duplicada na política.');
    units.add(job.unit);
  }
}

export function prepareBackupPolicy(policy) {
  if (
    !policy ||
    policy.host !== 'srv924325' ||
    policy.localRetentionDays !== 7 ||
    policy.externalRetentionDays !== 30 ||
    policy.minutobooksUploads !== false
  )
    throw new Error('Política incompatível com a VPS apps.');
  validateJobs(policy.jobs);
  const candidate = structuredClone(policy);
  const existing = candidate.jobs.find((job) => job.unit === manifestacaoJob.unit);
  if (existing) {
    if (
      existing.maxAgeHours !== manifestacaoJob.maxAgeHours ||
      existing.artifact !== manifestacaoJob.artifact
    )
      throw new Error('Cadastro Manifestacao existente diverge; revisão manual necessária.');
  } else candidate.jobs.push({ ...manifestacaoJob });
  return candidate;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error();
    const source = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(`${JSON.stringify(prepareBackupPolicy(source), null, 2)}\n`);
  } catch {
    console.error('Não foi possível preparar a política. Confira a entrada e os cadastros.');
    process.exitCode = 1;
  }
}
