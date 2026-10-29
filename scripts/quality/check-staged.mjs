import { execFileSync } from 'node:child_process';
import { inspectGitContent, inspectGitPath, MAX_GIT_FILE_BYTES } from './git-content.mjs';

function main() {
  const names = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    {
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter(Boolean);
  let failed = false;
  for (const name of names) {
    const bytes = execFileSync('git', ['cat-file', '-s', `:${name}`], { encoding: 'utf8' }).trim();
    let issues = inspectGitPath(name, Number(bytes));
    if (!issues.length) {
      const content = execFileSync('git', ['show', `:${name}`], { maxBuffer: MAX_GIT_FILE_BYTES });
      issues = inspectGitContent(name, content);
    }
    for (const issue of issues) {
      console.error(issue.message);
      failed = true;
    }
  }
  if (failed) process.exitCode = 1;
  else
    console.log(
      `${names.length} arquivos preparados conferidos; dados privados e credenciais excluídos.`,
    );
}

try {
  main();
} catch {
  // Erros de subprocessos podem conter buffers de arquivos; não imprimir error/cause.
  console.error(
    'Não foi possível conferir os arquivos preparados. Verifique a integridade do índice Git e tente novamente.',
  );
  process.exitCode = 1;
}
