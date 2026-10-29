import { readFileSync } from 'node:fs';

const message = readFileSync(process.argv[2], 'utf8').trim();
if (
  !/^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([a-z0-9-]+\))?!?: [^\r\n]{3,}$/.test(
    message.split('\n')[0],
  ) ||
  message.split('\n')[0].length > 100
) {
  console.error('Use Conventional Commits, com assunto em pt-BR de até 100 caracteres.');
  process.exitCode = 1;
}
