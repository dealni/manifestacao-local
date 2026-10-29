import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { testEnvironment } from '../scripts/quality/test-environment.mjs';

const execute = promisify(execFile);

function stopProcessGroup(pid) {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function executeFixture(cwd, options = {}) {
  const execution = execute(process.execPath, ['runner.mjs'], {
    cwd,
    env: testEnvironment(),
    timeout: 30000,
    detached: process.platform !== 'win32',
    ...options,
  });
  try {
    return await execution;
  } finally {
    if (process.platform !== 'win32' && execution.child.pid) {
      stopProcessGroup(execution.child.pid);
    }
  }
}
const sentinelEnvironment = {
  DATABASE_URL: 'postgres://fixture:fixture@127.0.0.1:1/fixture',
  NODE_ENV: 'production',
  DATA_DIR: '/fixture-does-not-exist/data',
  PUBLIC_DIR: '/fixture-does-not-exist/public',
  PUBLIC_ORIGIN: 'https://fixture.invalid',
  CLOUDFLARE_EMAIL_API_TOKEN: 'fixture-only-token',
  EMAIL_CODE_SECRET: 'fixture-only-secret',
  TURNSTILE_SITE_KEY: 'fixture-site-key',
  TURNSTILE_SECRET_KEY: 'fixture-secret-key',
  NODE_OPTIONS: '--conditions=fixture-sentinel',
  NODE_V8_COVERAGE: '/fixture-does-not-exist/coverage',
  NODE_TEST_CONTEXT: 'fixture-context',
  PGSERVICE: 'fixture-service',
  PGPASSFILE: '/fixture-does-not-exist/pgpass',
  PGHOST: '127.0.0.1',
  GIT_DIR: '/fixture-does-not-exist/git',
};

test('ambiente de testes permite somente variáveis portáveis explícitas', () => {
  const source = { ...sentinelEnvironment, PATH: '/fixture/bin', HOME: '/fixture/home' };
  const clean = testEnvironment(source);
  assert.deepEqual(clean, { PATH: source.PATH, HOME: source.HOME });
  assert.equal(source.NODE_ENV, 'production');
});

for (const runnerName of ['unit-tests', 'test-coverage']) {
  test(`${runnerName} limpa o ambiente antes dos testes e de seus subprocessos`, async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), 'manifestacao-test-environment-'));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    await mkdir(join(cwd, 'test'));
    await mkdir(join(cwd, 'src'));
    await writeFile(join(cwd, 'package.json'), '{"type":"module"}');
    await writeFile(join(cwd, 'src/example.js'), 'export const answer = () => 42;\n');
    const removedKeys = Object.keys(sentinelEnvironment).filter(
      (key) => !['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE'].includes(key),
    );
    await writeFile(
      join(cwd, 'test/example.test.js'),
      `import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {answer} from '../src/example.js';
const removed = ${JSON.stringify(removedKeys)};
for (const key of removed) assert.equal(process.env[key], undefined, key);
assert.notEqual(process.env.NODE_TEST_CONTEXT, 'fixture-context');
assert.notEqual(process.env.NODE_V8_COVERAGE, '/fixture-does-not-exist/coverage');
assert.equal(answer(), 42);
execFileSync(process.execPath, ['--input-type=module', '-e',
  'for (const key of ' + JSON.stringify(removed) + ') if (process.env[key] !== undefined) process.exit(1);']);
// Uma fixture continua podendo passar configuração explicitamente ao seu filho.
execFileSync(process.execPath, ['-e',
  'if (process.env.DATA_DIR !== "fixture-explicit") process.exit(1);'],
  {env: {...process.env, DATA_DIR: 'fixture-explicit'}});
`,
    );
    const runner = new URL(`../scripts/quality/${runnerName}.mjs`, import.meta.url);
    const exportName = runnerName === 'unit-tests' ? 'runUnitTests' : 'runCoverage';
    // Injeta sentinelas depois do bootstrap Node: nenhuma opção herdada pode
    // carregar código antes de o entrypoint ter a chance de isolar os workers.
    const launch = `Object.assign(process.env, ${JSON.stringify(sentinelEnvironment)});
const {${exportName}} = await import(${JSON.stringify(runner.href)});
process.exitCode = await ${exportName}() ? 0 : 1;`;
    await writeFile(join(cwd, 'runner.mjs'), launch);
    const { stdout, stderr } = await executeFixture(cwd);
    assert.doesNotMatch(stdout + stderr, /fixture-only-token|fixture-only-secret/);
  });
}

test(
  'timeout da fixture de cobertura encerra também seus workers',
  {
    skip: process.platform === 'win32' ? 'Grupos POSIX de processos.' : false,
  },
  async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), 'manifestacao-coverage-timeout-'));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    await mkdir(join(cwd, 'test'));
    await mkdir(join(cwd, 'src'));
    await writeFile(join(cwd, 'package.json'), '{"type":"module"}');
    await writeFile(join(cwd, 'src/example.js'), 'export const answer = 42;\n');
    await writeFile(
      join(cwd, 'test/example.test.js'),
      `
import {writeFileSync} from 'node:fs';
import test from 'node:test';
import {answer} from '../src/example.js';
test('pendente', async () => {
  writeFileSync('worker.pid', String(process.pid));
  await new Promise((resolve) => setTimeout(resolve, answer * 1000));
});
`,
    );
    const runner = new URL('../scripts/quality/test-coverage.mjs', import.meta.url);
    await writeFile(
      join(cwd, 'runner.mjs'),
      `
import {runCoverage} from ${JSON.stringify(runner.href)};
process.exitCode = await runCoverage() ? 0 : 1;
`,
    );
    await assert.rejects(executeFixture(cwd, { timeout: 1500 }));
    const worker = Number(await readFile(join(cwd, 'worker.pid'), 'utf8'));
    // O launcher é abortado pelo timeout; seu grupo é sempre recolhido no finally.
    let alive = true;
    for (let attempt = 0; attempt < 30 && alive; attempt++) {
      try {
        process.kill(worker, 0);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
        alive = false;
      }
      if (alive) await delay(20);
    }
    assert.equal(alive, false, 'Worker permaneceu vivo após timeout da fixture.');
  },
);
