import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findPostgresBinaries,
  isolatedEnvironment,
} from '../scripts/quality/postgres-integration.mjs';

test('gate PostgreSQL elimina configurações de conexão herdadas', () => {
  const environment = isolatedEnvironment({
    PATH: '/bin',
    HOME: '/home/test',
    PGHOST: 'shared',
    PGPORT: '5432',
    PGSERVICE: 'production',
    PGSERVICEFILE: '/secret',
    PGDATA: '/shared',
    PGPASSWORD: 'private',
    DATABASE_URL: 'postgres://shared',
    RUN_POSTGRES_FAILURE_TEST: '0',
    NODE_OPTIONS: '--import=/private/production-bootstrap.mjs',
    NODE_V8_COVERAGE: '/private/production-coverage',
    NODE_ENV: 'production',
    DATA_DIR: '/private/production-data',
    CLOUDFLARE_EMAIL_API_TOKEN: 'fixture-only-token',
    TURNSTILE_SECRET_KEY: 'fixture-only-secret',
    FUTURE_INTEGRATION_TOKEN: 'fixture-only-future-token',
  });
  assert.deepEqual(environment, { PATH: '/bin', HOME: '/home/test' });
});

test('gate exige instalação completa e respeita diretório explícito sem fallback', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'quality-pg-binaries-'));
  try {
    await assert.rejects(
      findPostgresBinaries({ QUALITY_POSTGRES_BIN: directory, PATH: process.env.PATH }),
      /PostgreSQL local obrigatório/,
    );
    writeFileSync(path.join(directory, 'initdb'), '', { mode: 0o700 });
    await assert.rejects(
      findPostgresBinaries({ QUALITY_POSTGRES_BIN: directory }),
      /PostgreSQL local obrigatório/,
    );
    writeFileSync(path.join(directory, 'pg_ctl'), '', { mode: 0o700 });
    assert.deepEqual(await findPostgresBinaries({ QUALITY_POSTGRES_BIN: directory }), {
      initdb: path.join(directory, 'initdb'),
      pg_ctl: path.join(directory, 'pg_ctl'),
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI falha claramente sem PostgreSQL mesmo com DATABASE_URL fornecida', () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, ['scripts/quality/postgres-integration.mjs'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          QUALITY_POSTGRES_BIN: '/nonexistent/manifestacao-quality-pg',
          DATABASE_URL: 'postgres://do-not-connect',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    (error) =>
      error.status === 1 &&
      /PostgreSQL local obrigatório|usuário comum/.test(error.stderr) &&
      !error.stderr.includes('do-not-connect'),
  );
});
