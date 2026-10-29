import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parsePushRefs, validatePushRefs } from './push-refs.mjs';
import { checkPushHistory } from './check-push-history.mjs';

function main() {
  const refs = validatePushRefs(parsePushRefs(readFileSync(0, 'utf8')));
  // Exclusões não introduzem conteúdo nem exigem um checkout sem alterações.
  if (!refs.length || refs.every((ref) => ref.deletion)) process.exit(0);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const history = checkPushHistory(refs);
  if (history.issues.length) {
    for (const issue of history.issues) console.error(issue.message);
    process.exit(1);
  }
  console.log(
    `Histórico conferido: ${history.objectsChecked} objetos e ${history.filesChecked} arquivos.`,
  );
  function clean() {
    if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) {
      console.error('Conclua as alterações antes do push.');
      process.exit(1);
    }
  }
  clean();
  const checked = spawnSync('npm', ['run', 'check:all'], { stdio: 'inherit' });
  if (checked.error) throw checked.error;
  if (checked.status !== 0) process.exit(checked.status || 1);
  clean();
  if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== head) {
    console.error('HEAD mudou durante a validação; repita o push após concluir as alterações.');
    process.exit(1);
  }
  validatePushRefs(refs);
}

try {
  main();
} catch {
  // Erros de subprocessos podem conter buffers de arquivos; não imprimir error/cause.
  console.error(
    'Não foi possível validar o push. Confira HEAD, referências e objetos remotos (git fetch), e repita os gates locais.',
  );
  process.exitCode = 1;
}
