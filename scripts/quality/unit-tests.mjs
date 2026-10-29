import { spawn } from 'node:child_process';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolateTestProcess } from './test-environment.mjs';

export async function runUnitTests({ cwd = process.cwd(), args = [] } = {}) {
  const env = isolateTestProcess();
  const files = globSync('test/*.test.js', { cwd }).sort();
  if (!files.length) throw new Error('Nenhum teste unitário encontrado.');
  const child = spawn(process.execPath, ['--test', ...args, ...files], {
    cwd,
    env,
    stdio: 'inherit',
  });
  return await new Promise((accept, reject) => {
    const signals = ['SIGINT', 'SIGTERM'];
    const handlers = signals.map((signal) => () => child.kill(signal));
    const cleanup = () => {
      signals.forEach((signal, index) => process.off(signal, handlers[index]));
    };
    signals.forEach((signal, index) => process.on(signal, handlers[index]));
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('exit', (code) => {
      cleanup();
      accept(code === 0);
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = (await runUnitTests({ args: process.argv.slice(2) })) ? 0 : 1;
}
