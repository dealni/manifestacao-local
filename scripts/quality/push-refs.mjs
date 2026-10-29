import { execFileSync } from 'node:child_process';

const objectName = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const zeroObject = /^0+$/;

// Contrato do stdin: https://git-scm.com/docs/githooks#_pre_push
export function parsePushRefs(input) {
  if (!input.trim()) return [];
  return input
    .trim()
    .split(/\r?\n/)
    .map((line, index) => {
      const fields = line.trim().split(/\s+/);
      const [localRef, localOid, remoteRef, remoteOid] = fields;
      if (
        fields.length !== 4 ||
        !objectName.test(localOid) ||
        !objectName.test(remoteOid) ||
        localOid.length !== remoteOid.length ||
        !remoteRef.startsWith('refs/')
      ) {
        throw new Error(`Entrada pre-push inválida na linha ${index + 1}.`);
      }
      const deletion = localRef === '(delete)';
      if (deletion !== zeroObject.test(localOid) || (deletion && zeroObject.test(remoteOid))) {
        throw new Error(`Exclusão pre-push inválida na linha ${index + 1}.`);
      }
      return { localRef, localOid, remoteRef, remoteOid, deletion };
    });
}

export function validatePushRefs(refs, { cwd = process.cwd() } = {}) {
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let head;
  for (const ref of refs) {
    try {
      git(['check-ref-format', ref.remoteRef]);
    } catch {
      throw new Error(`Referência remota inválida: ${ref.remoteRef}.`);
    }
    if (ref.deletion) continue;
    head ??= git(['rev-parse', '--verify', 'HEAD^{commit}']);
    let commit;
    try {
      // Tags anotadas possuem OID próprio; o gate valida o commit apontado.
      commit = git(['rev-parse', '--verify', `${ref.localOid}^{commit}`]);
    } catch {
      throw new Error(`O objeto enviado para ${ref.remoteRef} não aponta para um commit.`);
    }
    if (commit !== head) throw new Error('Validação exige que o commit enviado seja o HEAD atual.');
  }
  return refs;
}
