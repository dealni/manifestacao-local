import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePushRefs, validatePushRefs } from '../scripts/quality/push-refs.mjs';

const oid = 'a'.repeat(40);
const zero = '0'.repeat(40);

test('stdin pre-push aceita updates, criação, SHA-256 e exclusão', () => {
  const refs = parsePushRefs(
    `refs/heads/main ${oid} refs/heads/main ${zero}\n(delete) ${zero} refs/heads/antiga ${oid}\n`,
  );
  assert.equal(refs[0].deletion, false);
  assert.equal(refs[1].deletion, true);
  assert.equal(
    parsePushRefs(`HEAD ${'a'.repeat(64)} refs/heads/main ${'0'.repeat(64)}`)[0].localOid.length,
    64,
  );
  assert.deepEqual(parsePushRefs(''), []);
});

test('stdin pre-push rejeita campos incompletos, OIDs e exclusões malformados', () => {
  for (const input of [
    `HEAD ${oid} refs/heads/main`,
    `HEAD nope refs/heads/main ${zero}`,
    `HEAD ${zero} refs/heads/main ${oid}`,
    `(delete) ${oid} refs/heads/main ${oid}`,
    `(delete) ${zero} refs/heads/main ${zero}`,
    `HEAD ${oid} main ${zero}`,
    `HEAD ${oid} refs/heads/main ${'0'.repeat(64)}`,
  ])
    assert.throws(() => parsePushRefs(input), /pre-push inválida/);
});

test('validação aceita HEAD, revisões, tags leves/anotadas e exclusão; recusa commit antigo e objeto sem commit', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'manifestacao-push-refs-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  git('config', 'user.name', 'Fixture local');
  git('config', 'user.email', 'fixture@example.invalid');
  git('commit', '--allow-empty', '-m', 'test: primeiro');
  const first = git('rev-parse', 'HEAD');
  git('commit', '--allow-empty', '-m', 'test: segundo');
  const head = git('rev-parse', 'HEAD');
  git('tag', 'leve');
  git('tag', '-a', 'anotada', '-m', 'Tag local de teste');
  const tag = git('rev-parse', 'anotada');
  const validate = (line) => validatePushRefs(parsePushRefs(line), { cwd });
  for (const [name, value] of [
    ['HEAD', head],
    ['HEAD~0', head],
    ['refs/tags/leve', head],
    ['refs/tags/anotada', tag],
  ]) {
    assert.doesNotThrow(() => validate(`${name} ${value} refs/tags/destino ${zero}`));
  }
  assert.doesNotThrow(() => validate(`(delete) ${zero} refs/heads/antiga ${first}`));
  assert.throws(() => validate(`HEAD~ ${first} refs/heads/main ${head}`), /HEAD atual/);
  const tree = git('rev-parse', 'HEAD^{tree}');
  assert.throws(
    () => validate(`arvore ${tree} refs/tags/arvore ${zero}`),
    /não aponta para um commit/,
  );
  assert.throws(
    () => validate(`HEAD ${head} refs/heads/a..b ${zero}`),
    /Referência remota inválida/,
  );
});

test('push somente de exclusão funciona sem HEAD local', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'manifestacao-push-delete-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
  assert.doesNotThrow(() =>
    validatePushRefs(parsePushRefs(`(delete) ${zero} refs/heads/antiga ${oid}`), { cwd }),
  );
});
