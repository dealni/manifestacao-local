#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excluded =
  /^(?:\.env(?:\..*)?|README(?:\..*)?|demos?|state(?:\..*)?|uploads?|snapshots?|analysis|node_modules|tests?)$/i;
const fixedFiles = [
  'package.json',
  'package-lock.json',
  'data/catalog.json',
  'data/media-screens.json',
  'data/brasilia-layout.json',
  'data/brasilia-model-assets.json',
  'data/music-tracks.json',
];
const trees = ['src', 'public', 'deploy'];

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

export async function collectReleaseFiles(projectRoot = root) {
  const entries = [];
  async function visit(relative) {
    if (relative !== 'deploy/README.md' && relative.split('/').some((part) => excluded.test(part)))
      return;
    if (/[\r\n\0]/.test(relative)) throw new Error('Nome de arquivo incompatível com o pacote.');
    const info = await lstat(path.join(projectRoot, relative));
    if (info.isSymbolicLink()) throw new Error(`Link simbólico não permitido: ${relative}`);
    if (info.isDirectory()) {
      for (const name of (await readdir(path.join(projectRoot, relative))).sort())
        await visit(`${relative}/${name}`);
    } else if (info.isFile()) {
      entries.push(relative);
    } else {
      throw new Error(`Tipo de arquivo não permitido: ${relative}`);
    }
  }
  // Os arquivos fixos também precisam validar seus diretórios pais: lstat
  // do arquivo final não detecta, por exemplo, data/ apontando para fora.
  for (const relative of fixedFiles) {
    const parts = relative.split('/');
    for (let length = 1; length < parts.length; length++) {
      const parent = parts.slice(0, length).join('/');
      if ((await lstat(path.join(projectRoot, parent))).isSymbolicLink()) {
        throw new Error(`Link simbólico não permitido: ${parent}`);
      }
    }
  }
  for (const relative of [...fixedFiles, ...trees]) await visit(relative);
  return entries.sort();
}

export async function packageProduction(output, projectRoot = root) {
  if (!output || !path.isAbsolute(output) || !/\.tar\.gz$/.test(output)) {
    throw new Error('Informe um caminho absoluto externo ao projeto, terminado em .tar.gz.');
  }
  const source = await realpath(projectRoot);
  const destination = path.join(await realpath(path.dirname(output)), path.basename(output));
  if (isInside(source, destination)) throw new Error('O pacote deve ser salvo fora do projeto.');
  try {
    await lstat(destination);
    throw new Error('O destino já existe; escolha um novo nome.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const entries = await collectReleaseFiles(source);
  if (!entries.length) throw new Error('Pacote vazio.');
  function tar(args, input) {
    const result = spawnSync('tar', args, {
      input,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`tar falhou: ${result.stderr.trim()}`);
    return result.stdout;
  }
  try {
    tar(['-czf', destination, '-C', source, '-T', '-'], `${entries.join('\n')}\n`);
    const actual = tar(['-tzf', destination]).trim().split('\n').sort();
    if (
      actual.length !== entries.length ||
      actual.some((entry, index) => entry !== entries[index])
    ) {
      throw new Error('O conteúdo do arquivo gerado diverge da lista permitida.');
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(destination)) hash.update(chunk);
    return {
      path: destination,
      files: entries.length,
      bytes: (await lstat(destination)).size,
      sha256: hash.digest('hex'),
    };
  } catch (error) {
    await unlink(destination).catch(() => {});
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3)
      throw new Error('Uso: node scripts/package-production.mjs /caminho/externo/release.tar.gz');
    console.log(JSON.stringify(await packageProduction(process.argv[2])));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
