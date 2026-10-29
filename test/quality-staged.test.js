import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('../scripts/quality/staged-quality.mjs', import.meta.url));

test('gate preparado usa o índice e reprova lint ou formatação sem reescrever arquivos', () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'manifestacao-staged-quality-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd });
    mkdirSync(path.join(cwd, 'src'));
    writeFileSync(
      path.join(cwd, 'eslint.config.mjs'),
      'export default [{ rules: { "no-undef": "error" }, languageOptions: { globals: { console: "readonly" } } }];\n',
    );
    writeFileSync(
      path.join(cwd, '.prettierrc.json'),
      readFileSync(new URL('../.prettierrc.json', import.meta.url)),
    );
    const filename = path.join(cwd, 'src/sample.js');
    const prepare = (content) => {
      writeFileSync(filename, content);
      execFileSync('git', ['add', '--', 'src/sample.js'], { cwd });
    };
    const run = () => spawnSync(process.execPath, [checker], { cwd, encoding: 'utf8' });

    prepare('const value = 1;\nconsole.log(value);\n');
    writeFileSync(filename, 'WORKSPACE SEM SINTAXE VÁLIDA');
    assert.equal(run().status, 0, 'conteúdo não preparado não deve substituir o índice');
    assert.equal(readFileSync(filename, 'utf8'), 'WORKSPACE SEM SINTAXE VÁLIDA');

    prepare('missingVariable;\n');
    assert.notEqual(run().status, 0, 'erro de lint no índice deve reprovar');
    prepare('const value=1;console.log(value);\n');
    assert.notEqual(run().status, 0, 'formatação pendente deve reprovar');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
