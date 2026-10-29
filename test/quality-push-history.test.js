import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkPushHistory } from '../scripts/quality/check-push-history.mjs';

const ZERO = '0'.repeat(40);
const fakeCredential = () => `ghp_${'Z'.repeat(36)}`;

function repository(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'manifestacao-history-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    }).trim();
  git('init', '--quiet', '--template=');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  const write = (name, content) => {
    mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
    writeFileSync(path.join(cwd, name), content);
  };
  const commit = (message = 'test: fixture') => {
    git('add', '--all');
    git('commit', '--quiet', '--no-gpg-sign', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const scan = (localOid, remoteOid = ZERO) =>
    checkPushHistory(
      [{ localRef: 'HEAD', localOid, remoteRef: 'refs/heads/main', remoteOid, deletion: false }],
      { cwd },
    );
  return { cwd, git, write, commit, scan };
}

test('histórico permite primeiro envio de fontes e catálogos públicos', (t) => {
  const repo = repository(t);
  repo.write('data/catalog.json', '{}');
  repo.write('README.md', 'conteúdo público');
  const result = repo.scan(repo.commit());
  assert.deepEqual(result.issues, []);
  assert.equal(result.filesChecked, 2);
});

test('histórico bloqueia segredo em commit intermediário mesmo removido do HEAD', (t) => {
  const repo = repository(t);
  repo.write('README.md', 'baseline');
  const baseline = repo.commit();
  repo.write('example.txt', fakeCredential());
  repo.commit();
  repo.write('example.txt', 'removido');
  const result = repo.scan(repo.commit(), baseline);
  assert.ok(
    result.issues.some((issue) => issue.code === 'credential' && issue.path === 'example.txt'),
  );
  assert.ok(!JSON.stringify(result).includes(fakeCredential()));
});

test('histórico exclui objetos anteriores ao intervalo e verifica nova branch inteira', (t) => {
  const repo = repository(t);
  repo.write('old.txt', fakeCredential());
  const baseline = repo.commit();
  repo.write('README.md', 'novo arquivo público');
  const head = repo.commit();
  assert.deepEqual(repo.scan(head, baseline).issues, []);
  assert.ok(repo.scan(head).issues.some((issue) => issue.code === 'credential'));
});

test('histórico detecta rename para caminho privado mesmo reutilizando blob antigo', (t) => {
  const repo = repository(t);
  repo.write('public.txt', 'baseline');
  const baseline = repo.commit();
  repo.git('mv', 'public.txt', '.env');
  const result = repo.scan(repo.commit(), baseline);
  assert.ok(
    result.issues.some((issue) => issue.code === 'forbidden-path' && issue.path === '.env'),
  );
});

test('histórico verifica mensagens de commit e de tag anotada sem expor conteúdo', (t) => {
  const repo = repository(t);
  repo.write('README.md', 'público');
  const head = repo.commit(`test: ${fakeCredential()}`);
  repo.git('tag', '--annotate', 'fixture', '-m', fakeCredential());
  const result = repo.scan(repo.git('rev-parse', 'refs/tags/fixture'));
  assert.ok(result.issues.filter((issue) => issue.code === 'credential').length >= 2);
  assert.ok(!JSON.stringify(result).includes(fakeCredential()));
  assert.ok(result.objectsChecked > repo.scan(head).objectsChecked);
});

test('histórico verifica refs diretas para blob e árvore', (t) => {
  const repo = repository(t);
  repo.write('leak.txt', fakeCredential());
  repo.commit();
  const blob = repo.git('rev-parse', 'HEAD:leak.txt');
  assert.ok(repo.scan(blob).issues.some((issue) => issue.code === 'credential'));
  const tree = repo.git('rev-parse', 'HEAD^{tree}');
  assert.ok(
    repo
      .scan(tree)
      .issues.some((issue) => issue.code === 'credential' && issue.path === 'leak.txt'),
  );
});

test('histórico ignora exclusão e falha fechado quando fronteira remota está ausente', (t) => {
  const repo = repository(t);
  repo.write('README.md', 'público');
  const head = repo.commit();
  const result = checkPushHistory([{ localOid: ZERO, remoteOid: head, deletion: true }], {
    cwd: repo.cwd,
  });
  assert.deepEqual(result, { objectsChecked: 0, filesChecked: 0, issues: [] });
  assert.throws(() => repo.scan(head, 'f'.repeat(40)), /faça fetch/);
});

test('histórico verifica commits de force update fora da ancestralidade remota', (t) => {
  const repo = repository(t);
  repo.write('README.md', 'baseline');
  const baseline = repo.commit();
  repo.write('a.txt', 'remoto');
  const remote = repo.commit();
  repo.git('checkout', '--quiet', '--detach', baseline);
  repo.write('branch.txt', fakeCredential());
  assert.ok(repo.scan(repo.commit(), remote).issues.some((issue) => issue.code === 'credential'));
});

test('histórico não reavalia objetos já remotos em no-op ou rewind', (t) => {
  const repo = repository(t);
  repo.write('old.txt', fakeCredential());
  const baseline = repo.commit();
  repo.write('README.md', 'novo arquivo público');
  const remote = repo.commit();
  assert.deepEqual(repo.scan(remote, remote), { objectsChecked: 0, filesChecked: 0, issues: [] });
  assert.deepEqual(repo.scan(baseline, remote), { objectsChecked: 0, filesChecked: 0, issues: [] });
});
