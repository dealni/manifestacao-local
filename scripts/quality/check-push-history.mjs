import { execFileSync } from 'node:child_process';
import { inspectGitContent, inspectGitPath, MAX_GIT_FILE_BYTES } from './git-content.mjs';

const ZERO_OID = /^0+$/;

function introducedObjects(refs, git) {
  const objectIds = new Set();
  for (const ref of refs) {
    if (ref.deletion || ZERO_OID.test(ref.localOid)) continue;
    if (
      !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(ref.localOid) ||
      !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(ref.remoteOid)
    ) {
      throw new Error('Plano de referências contém identificador Git inválido.');
    }
    const revisions = [ref.localOid];
    if (!ZERO_OID.test(ref.remoteOid)) {
      try {
        git(['cat-file', '-e', ref.remoteOid]);
      } catch {
        throw new Error(
          'Objeto remoto indisponível localmente; faça fetch antes de verificar o histórico do push.',
        );
      }
      revisions.push(`^${ref.remoteOid}`);
    }
    for (const oid of git(['rev-list', '--objects', '--no-object-names', ...revisions, '--'])
      .trim()
      .split('\n')) {
      if (oid) objectIds.add(oid);
    }
  }
  return objectIds;
}

function objectsIncludingRenamedBlobs(objects, changedEntries, git) {
  const byOid = new Map(objects.map((object) => [object.oid, object]));
  // Um rename pode introduzir um caminho privado usando um blob já existente.
  for (const oid of changedEntries.keys()) {
    if (!byOid.has(oid))
      byOid.set(oid, { oid, type: 'blob', size: Number(git(['cat-file', '-s', oid]).trim()) });
  }
  return byOid;
}

/** Inspeciona os objetos e caminhos introduzidos por cada atualização do pre-push. */
export function checkPushHistory(refs, { cwd = process.cwd() } = {}) {
  const git = (args, options = {}) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    });
  const changedEntries = new Map();
  const issues = [];
  const issueKeys = new Set();
  const record = (findings, objectId, path) => {
    for (const finding of findings) {
      const key = `${finding.code}\0${objectId}\0${path || ''}`;
      if (issueKeys.has(key)) continue;
      issueKeys.add(key);
      issues.push({ ...finding, objectId, ...(path ? { path } : {}) });
    }
  };

  // Nunca excluir --all ou refs locais: elas podem conter commits ainda inéditos
  // no remoto. A fronteira confiável é o OID remoto recebido pelo próprio Git.
  const objectIds = introducedObjects(refs, git);
  if (!objectIds.size) return { objectsChecked: 0, filesChecked: 0, issues };

  const objects = git(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
    input: `${[...objectIds].join('\n')}\n`,
  })
    .trim()
    .split('\n')
    .map((line) => {
      const [oid, type, rawSize] = line.split(' ');
      const size = Number(rawSize);
      if (!['blob', 'tree', 'commit', 'tag'].includes(type) || !Number.isSafeInteger(size)) {
        throw new Error('Não foi possível inspecionar um objeto Git do push.');
      }
      return { oid, type, size };
    });

  const addEntries = (treeish, paths) => {
    for (const entry of git(['ls-tree', '-r', '-z', treeish]).split('\0').filter(Boolean)) {
      const tab = entry.indexOf('\t');
      const [, type, oid] = entry.slice(0, tab).split(' ');
      const name = entry.slice(tab + 1);
      if (type !== 'blob' || (paths && !paths.has(name) && !objectIds.has(oid))) continue;
      if (!changedEntries.has(oid)) changedEntries.set(oid, new Set());
      changedEntries.get(oid).add(name);
    }
  };
  for (const object of objects) {
    if (object.type !== 'commit') continue;
    // -m inclui resoluções de merge; --root inclui o primeiro commit.
    const paths = new Set(
      git([
        'diff-tree',
        '--root',
        '-r',
        '-m',
        '--no-commit-id',
        '--name-only',
        '--diff-filter=ACMRT',
        '-z',
        object.oid,
      ])
        .split('\0')
        .filter(Boolean),
    );
    addEntries(object.oid, paths);
  }
  // Tags podem apontar diretamente para uma árvore, sem commit intermediário.
  for (const ref of refs) {
    if (ref.deletion || ZERO_OID.test(ref.localOid)) continue;
    const peeled = git(['rev-parse', `${ref.localOid}^{}`]).trim();
    if (objectIds.has(peeled) && git(['cat-file', '-t', peeled]).trim() === 'tree')
      addEntries(peeled);
  }

  const byOid = objectsIncludingRenamedBlobs(objects, changedEntries, git);
  let filesChecked = 0;
  for (const { oid, type, size } of byOid.values()) {
    if (type === 'tree') continue;
    const names = changedEntries.get(oid) || new Set([`git-object/${type}/${oid}`]);
    for (const name of names) record(inspectGitPath(name, size), oid, name);
    if (type === 'blob') filesChecked += names.size;
    if (size >= MAX_GIT_FILE_BYTES) continue;
    const content = git(['cat-file', type, oid], { encoding: null });
    // O scanner nunca inclui o conteúdo em mensagens ou resultados.
    const name = names.values().next().value;
    record(
      inspectGitContent(name, content).filter((finding) => finding.code === 'credential'),
      oid,
      name,
    );
  }
  return { objectsChecked: byOid.size, filesChecked, issues };
}
