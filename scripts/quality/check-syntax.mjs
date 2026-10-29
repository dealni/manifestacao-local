import { spawnSync } from 'node:child_process';
import { collectFormatTargets } from './format.mjs';

const files = (await collectFormatTargets()).filter((name) => /\.[cm]?js$/.test(name));
for (const filename of files) {
  const result = spawnSync(process.execPath, ['--check', filename], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`${files.length} arquivos JavaScript próprios com sintaxe válida.`);
