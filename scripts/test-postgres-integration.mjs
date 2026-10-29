import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { openPostgresPersistence } from '../src/persistence.js';

// Run only against a dedicated integration database. The connection string is
// read from the environment and is never printed, including on failures.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL é obrigatória; use um banco dedicado aos testes de integração.');
  process.exitCode = 1;
} else {
  const key = `integration-${randomUUID()}`;
  const control = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
  });
  const adapters = new Set();
  let stage = 'conexão';
  let failed = false;
  let fixtureInserted = false;
  const open = async (options = {}) => {
    const adapter = await openPostgresPersistence({ connectionString, key, ...options });
    adapters.add(adapter);
    fixtureInserted = true;
    return adapter;
  };
  const close = async (adapter) => {
    try {
      await adapter.close();
    } finally {
      adapters.delete(adapter);
    }
  };
  try {
    await control.query('SELECT 1');
    stage = 'estado inicial';
    const initial = { users: [], fixture: { marker: key, count: 0 }, untouched: true };
    const first = await open({ initialState: initial });
    assert.deepEqual(first.state, initial);
    assert.equal(first.health().ok, true);
    assert.equal(first.health().revision, 0);

    stage = 'exclusão de escritor concorrente';
    await assert.rejects(
      () => openPostgresPersistence({ connectionString, key }),
      /outro servidor/,
    );
    assert.equal(first.health().ok, true);
    console.log('OK: segundo escritor da mesma fixture foi recusado.');

    stage = 'gravação e confirmação';
    first.state.fixture.count = 1;
    first.state.users.push({ id: 'integration-user', name: 'Teste de integração' });
    first.save();
    await first.flush();
    const expected = structuredClone(first.state);
    const saved = await control.query(
      'SELECT schema_version, revision, payload FROM manifestacao_state WHERE state_key = $1',
      [key],
    );
    assert.equal(saved.rowCount, 1);
    assert.equal(saved.rows[0].schema_version, 1);
    assert.equal(Number(saved.rows[0].revision), 1);
    assert.deepEqual(saved.rows[0].payload, expected);
    await close(first);

    stage = 'reabertura e preservação';
    const reopened = await open({ initialState: { defaultAdded: true } });
    assert.deepEqual(reopened.state, { defaultAdded: true, ...expected });
    assert.equal(reopened.health().revision, 1);
    reopened.state.fixture.count = 2;
    reopened.save();
    await reopened.flush();
    assert.equal(reopened.health().revision, 2);
    await close(reopened);
    console.log('OK: snapshot, revisão transacional, reabertura e liberação do bloqueio.');

    if (process.env.RUN_POSTGRES_FAILURE_TEST === '1') {
      stage = 'falha controlada da conexão própria';
      let ownBackendPid;
      let observedFailure;
      class TrackedPool extends pg.Pool {
        async connect() {
          const client = await super.connect();
          ownBackendPid = client.processID;
          return client;
        }
      }
      const faulted = await open({
        Pool: TrackedPool,
        onError: (error) => {
          observedFailure = error;
        },
      });
      assert.ok(Number.isSafeInteger(ownBackendPid) && ownBackendPid > 0);
      const ownSession = await control.query(
        `SELECT pid FROM pg_stat_activity
        WHERE pid = $1 AND datname = current_database() AND usename = current_user`,
        [ownBackendPid],
      );
      assert.equal(ownSession.rowCount, 1, 'A conexão alvo deve pertencer ao próprio teste.');
      const terminated = await control.query('SELECT pg_terminate_backend($1) AS terminated', [
        ownBackendPid,
      ]);
      if (terminated) {
        assert.equal(terminated.rows[0].terminated, true);
        for (let attempt = 0; attempt < 60 && faulted.health().ok; attempt++) await delay(50);
        assert.equal(faulted.health().ok, false);
        assert.ok(observedFailure instanceof Error);
        assert.throws(() => faulted.save(), /Falha na persistência/);
        await assert.rejects(() => faulted.flush(), /Falha na persistência/);
        await assert.rejects(() => close(faulted));
        console.log('OK: perda da conexão própria sinalizada e novas gravações recusadas.');
        const recovered = await open();
        assert.equal(recovered.state.fixture.count, 2);
        await close(recovered);
        console.log('OK: último snapshot confirmado recuperado após a falha.');
      } else {
        throw new Error('Não foi possível terminar a conexão própria; teste de falha obrigatório.');
      }
    } else {
      console.log('SKIP: falha de conexão opcional; habilite RUN_POSTGRES_FAILURE_TEST=1.');
    }
  } catch {
    failed = true;
    console.error(
      `FALHA na integração PostgreSQL: ${stage}. Detalhes omitidos para proteger credenciais.`,
    );
  } finally {
    for (const adapter of adapters) {
      try {
        await adapter.close();
      } catch {
        /* failure test deliberately closes a broken connection */
      }
    }
    try {
      // Never drop schemas/databases or delete any other state. Even a failed
      // run can only remove the UUID fixture created by this invocation.
      if (fixtureInserted) {
        await control.query('DELETE FROM manifestacao_state WHERE state_key = $1', [key]);
        const remaining = await control.query(
          'SELECT 1 FROM manifestacao_state WHERE state_key = $1',
          [key],
        );
        assert.equal(remaining.rowCount, 0);
        console.log('OK: somente a linha da fixture foi removida.');
      }
    } catch {
      failed = true;
      console.error(
        'FALHA ao limpar a fixture de integração; nenhum banco ou tabela foi removido.',
      );
    }
    await control.end();
    process.exitCode = failed ? 1 : 0;
  }
}
