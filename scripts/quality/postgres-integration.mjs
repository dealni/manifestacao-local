import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, appendFile, chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { testEnvironment } from './test-environment.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));

// Never inherit a connection, service file or cluster from the developer shell.
export function isolatedEnvironment(source = process.env) {
  return testEnvironment(source);
}

export async function findPostgresBinaries(environment = process.env) {
  const directories = environment.QUALITY_POSTGRES_BIN
    ? [environment.QUALITY_POSTGRES_BIN]
    : (environment.PATH || '').split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    const binaries = Object.fromEntries(
      ['initdb', 'pg_ctl'].map((name) => [name, path.resolve(directory, name)]),
    );
    try {
      await Promise.all(Object.values(binaries).map((file) => access(file, constants.X_OK)));
      return binaries;
    } catch {
      /* Try the next complete binary installation. */
    }
  }
  throw new Error(
    'PostgreSQL local obrigatório: instale initdb e pg_ctl no PATH ou defina QUALITY_POSTGRES_BIN. O gate não usa DATABASE_URL e não pula a integração.',
  );
}

export async function runPostgresIntegration() {
  if (process.getuid?.() === 0)
    throw new Error('Execute o gate como usuário comum: initdb não permite root.');
  const binaries = await findPostgresBinaries();
  const environment = isolatedEnvironment();
  // /tmp keeps Unix socket names below the PostgreSQL/macOS path-length limit.
  const directory = await mkdtemp('/tmp/manifestacao-pg-');
  await chmod(directory, 0o700);
  const data = path.join(directory, 'data');
  const sockets = path.join(directory, 'socket');
  await mkdir(sockets, { mode: 0o700 });
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let startAttempted = false;
  let stage = 'inicialização do cluster temporário';
  let failure;
  try {
    await execute(
      binaries.initdb,
      [
        '-D',
        data,
        '-U',
        'quality_test',
        '--encoding=UTF8',
        '--locale=C',
        '--auth-local=trust',
        '--auth-host=reject',
      ],
      { env: environment, signal: controller.signal, timeout: 60000 },
    );
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    await appendFile(
      path.join(data, 'postgresql.conf'),
      `\nlisten_addresses = ''\nunix_socket_directories = ${quote(sockets)}\nunix_socket_permissions = 0700\nmax_connections = 10\nshared_buffers = '16MB'\n`,
    );
    stage = 'início do cluster temporário';
    startAttempted = true;
    await execute(
      binaries.pg_ctl,
      ['-D', data, '-l', path.join(directory, 'postgres.log'), '-w', '-t', '30', 'start'],
      { env: environment, signal: controller.signal, timeout: 40000 },
    );
    stage = 'persistência, exclusão de escritor, recuperação e falha da conexão própria';
    const connection = new URL('postgresql://quality_test@localhost/postgres');
    connection.searchParams.set('host', sockets);
    const result = await execute(
      process.execPath,
      [path.join(root, 'scripts/test-postgres-integration.mjs')],
      {
        cwd: root,
        env: { ...environment, DATABASE_URL: connection.href, RUN_POSTGRES_FAILURE_TEST: '1' },
        signal: controller.signal,
        timeout: 60000,
      },
    );
    process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  } catch (cause) {
    // Suppress subprocess diagnostics: inherited shell values must never leak.
    failure = new Error(`Gate PostgreSQL falhou em: ${stage}.`, { cause });
  } finally {
    let stopped = !startAttempted;
    try {
      // Also attempt stop after an interrupted start, which may have launched postgres.
      await execute(binaries.pg_ctl, ['-D', data, '-m', 'immediate', '-w', '-t', '30', 'stop'], {
        env: environment,
        timeout: 40000,
      });
      stopped = true;
    } catch {
      try {
        await access(path.join(data, 'postmaster.pid'));
      } catch {
        stopped = true;
      }
      if (!stopped)
        failure ??= new Error(
          `Não foi possível encerrar o cluster de teste; dados preservados em ${directory}.`,
        );
    }
    if (stopped) await rm(directory, { recursive: true, force: true });
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
  if (failure) throw failure;
  console.log('OK: integração PostgreSQL real concluída; cluster temporário encerrado e removido.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runPostgresIntegration();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
