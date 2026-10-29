import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { testEnvironment } from './test-environment.mjs';

const execute = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const generatedFiles = [
  'public/client.js',
  'public/index.html',
  'src/paint-terrain.json',
  'analysis/client-readable.js',
];

async function readOutputs(root) {
  return Promise.all(
    generatedFiles.map(async (name) => {
      try {
        return await readFile(path.join(root, name));
      } catch (error) {
        if (error.code === 'ENOENT')
          throw new Error(`Artefato gerado ausente: ${name}`, { cause: error });
        throw error;
      }
    }),
  );
}

/** Gera apenas em uma cópia descartável; nunca regenera o checkout durante a verificação. */
export async function checkGenerated({ root = projectRoot } = {}) {
  root = path.resolve(root);
  const expected = await readOutputs(root);
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'manifestacao-generated-'));
  try {
    await Promise.all(
      ['public', 'analysis', 'src', 'data'].map((name) =>
        mkdir(path.join(temporary, name), { recursive: true }),
      ),
    );
    await Promise.all([
      cp(path.join(root, 'scripts'), path.join(temporary, 'scripts'), { recursive: true }),
      cp(path.join(root, 'src'), path.join(temporary, 'src'), { recursive: true }),
      cp(path.join(root, 'package.json'), path.join(temporary, 'package.json')),
      cp(
        path.join(root, 'analysis/original-index.html'),
        path.join(temporary, 'analysis/original-index.html'),
      ),
      cp(
        path.join(root, 'data/media-screens.json'),
        path.join(temporary, 'data/media-screens.json'),
      ),
      cp(
        path.join(root, 'data/brasilia-layout.json'),
        path.join(temporary, 'data/brasilia-layout.json'),
      ),
      cp(path.join(root, 'data/music-tracks.json'), path.join(temporary, 'data/music-tracks.json')),
      // Esses diretórios são apenas entradas do gerador. As quatro saídas têm pais reais na cópia.
      symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'dir'),
      symlink(path.join(root, 'public/assets'), path.join(temporary, 'public/assets'), 'dir'),
    ]);
    const entries = await readdir(path.join(root, 'public'), { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && !generatedFiles.includes(`public/${entry.name}`))
        .map((entry) =>
          cp(path.join(root, 'public', entry.name), path.join(temporary, 'public', entry.name)),
        ),
    );

    let first;
    for (let generation = 1; generation <= 2; generation++) {
      // Uma segunda execução não pode reutilizar silenciosamente uma saída da primeira.
      await Promise.all(
        generatedFiles.map((name) => rm(path.join(temporary, name), { force: true })),
      );
      await execute(process.execPath, ['scripts/prepare-client.js'], {
        cwd: temporary,
        // Node propaga NODE_V8_COVERAGE mesmo com allowlist. A propriedade
        // explícita impede a cópia e undefined omite a variável no filho.
        env: { ...testEnvironment(), NODE_V8_COVERAGE: undefined },
      });
      const actual = await readOutputs(temporary);
      if (generation === 1) first = actual;
      const unstable = generatedFiles.filter((_, index) => !actual[index].equals(first[index]));
      if (unstable.length) throw new Error(`Geração não determinística: ${unstable.join(', ')}`);
      const drift = generatedFiles.filter((_, index) => !actual[index].equals(expected[index]));
      if (drift.length)
        throw new Error(
          `Artefatos desatualizados: ${drift.join(', ')}. Execute npm run prepare-client e revise o diff.`,
        );
    }
    return generatedFiles;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const files = await checkGenerated();
    console.log(
      `Geração reproduzível: ${files.length} artefatos conferidos em duas execuções isoladas.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
