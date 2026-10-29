import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ESLint } from 'eslint';
import * as prettier from 'prettier';
import { isOwnSource } from './format.mjs';

const names = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);
const eslint = new ESLint();
const results = [];
let failed = false;
for (const name of names.filter(isOwnSource)) {
  const content = execFileSync('git', ['show', `:${name}`], {
    maxBuffer: 100 * 1024 * 1024,
  }).toString('utf8');
  const filepath = path.resolve(name);
  if (!(await prettier.check(content, { ...(await prettier.resolveConfig(filepath)), filepath }))) {
    console.error(
      `Formatação pendente no índice: ${name}. Execute npm run format e prepare o arquivo novamente.`,
    );
    failed = true;
  }
  if (/\.[cm]?js$/.test(name) && !(await eslint.isPathIgnored(filepath))) {
    results.push(...(await eslint.lintText(content, { filePath: filepath })));
  }
}
if (results.length) {
  const report = await (await eslint.loadFormatter('stylish')).format(results);
  if (report) console.error(report);
  failed ||= results.some((result) => result.errorCount || result.warningCount);
}
if (failed) process.exitCode = 1;
else console.log('Lint e formatação dos arquivos preparados aprovados.');
