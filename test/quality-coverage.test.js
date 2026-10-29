import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const runner = new URL('../scripts/quality/test-coverage.mjs', import.meta.url).href;

async function fixture(t, { source, testSource, extraSource }) {
  const cwd = await mkdtemp(join(tmpdir(), 'manifestacao-coverage-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, 'src'));
  await mkdir(join(cwd, 'test'));
  await writeFile(join(cwd, 'package.json'), '{"type":"module"}');
  await writeFile(join(cwd, 'src/example.js'), source);
  if (extraSource) await writeFile(join(cwd, 'src/unloaded.js'), extraSource);
  await writeFile(join(cwd, 'test/example.test.js'), testSource);
  await writeFile(
    join(cwd, 'coverage-runner.mjs'),
    `import {runCoverage} from ${JSON.stringify(runner)}; process.exitCode = await runCoverage() ? 0 : 1;`,
  );
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  try {
    const result = await execute(process.execPath, ['coverage-runner.mjs'], { cwd, env });
    return { status: 0, output: result.stdout + result.stderr };
  } catch (error) {
    if (typeof error.code !== 'number') throw error;
    return { status: error.code, output: error.stdout + error.stderr };
  }
}

const covered = {
  source: 'export const answer = () => 42;\n',
  testSource:
    'import {answer} from "../src/example.js"; import assert from "node:assert/strict"; assert.equal(answer(),42);\n',
};

test('gate aceita uma suíte aprovada que cobre todas as fontes', async (t) => {
  const result = await fixture(t, covered);
  assert.equal(result.status, 0, result.output);
});

test('gate rejeita fonte não carregada, mesmo com 100% no relatório parcial', async (t) => {
  const result = await fixture(t, { ...covered, extraSource: 'export const absent = () => 1;\n' });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /Fonte sem cobertura coletada: src\/unloaded\.js/);
});

test('gate rejeita branches não exercitados apesar de os testes passarem', async (t) => {
  const result = await fixture(t, {
    source: 'export function sign(n) { if (n > 0) return 1; return -1; }\n',
    testSource:
      'import {sign} from "../src/example.js"; import assert from "node:assert/strict"; assert.equal(sign(1),1);\n',
  });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /Cobertura branches:/);
});
