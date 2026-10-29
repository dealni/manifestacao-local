import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as prettier from 'prettier';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const rootFiles = new Set(['package.json', '.prettierrc.json', 'lefthook.yml']);

export function isOwnSource(filename) {
  const name = filename.replaceAll('\\', '/');
  if (name.split('/').some((part) => part === '..' || part === 'vendor')) return false;
  return (
    rootFiles.has(name) ||
    /^tsconfig(?:\.[^/]+)?\.json$/.test(name) ||
    /^[^/]+\.config\.[cm]?js$/.test(name) ||
    /^(?:src|scripts|test)\/.+\.(?:[cm]?js|ts)$/.test(name) ||
    /^types\/.+\.ts$/.test(name) ||
    /^public\/[^/]+\.css$/.test(name) ||
    name === 'public/local-compat.js'
  );
}

export async function collectFormatTargets(root = projectRoot, filenames) {
  if (filenames) {
    return [...new Set(filenames.map((name) => path.relative(root, path.resolve(root, name))))]
      .filter(isOwnSource)
      .sort();
  }
  const targets = [];
  async function visit(directory) {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const name = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const sourceDirectory =
          directory || ['src', 'scripts', 'test', 'types', 'public'].includes(entry.name);
        if (sourceDirectory && entry.name !== 'vendor' && directory !== 'public') await visit(name);
      } else if (entry.isFile() && isOwnSource(name)) targets.push(name);
    }
  }
  await visit('');
  return targets.sort();
}

export async function formatSources({ root = projectRoot, filenames, write = false } = {}) {
  const targets = await collectFormatTargets(root, filenames);
  const changed = [];
  for (const name of targets) {
    const filepath = path.join(root, name);
    const options = { ...(await prettier.resolveConfig(filepath)), filepath };
    const input = await readFile(filepath, 'utf8');
    const output = await prettier.format(input, options);
    if (output !== input) {
      changed.push(name);
      if (write) await writeFile(filepath, output);
    }
  }
  return { targets, changed };
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.shift();
  if (!['--check', '--write'].includes(mode) || args.some((arg) => arg.startsWith('--'))) {
    throw new Error('Uso: node scripts/quality/format.mjs --check|--write [arquivos...]');
  }
  const { targets, changed } = await formatSources({
    filenames: args.length ? args : undefined,
    write: mode === '--write',
  });
  if (changed.length && mode === '--check') {
    console.error(`Formatação pendente em ${changed.length} arquivo(s):\n${changed.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`${targets.length} fontes próprias conferidas; ${changed.length} formatadas.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
