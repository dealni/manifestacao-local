import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

/**
 * PostgreSQL schema v1. A single versioned JSONB document intentionally preserves
 * the mutable game-state contract. It is not a normalized relational model.
 * Revision advances inside the same transaction as every committed snapshot.
 * A session advisory lock excludes concurrent simulation writers for this key.
 */
export const POSTGRES_SCHEMA = `CREATE TABLE IF NOT EXISTS manifestacao_state (
  state_key text PRIMARY KEY,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
)`;

function snapshot(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('O estado persistente deve ser um objeto.');
  }
  const payload = JSON.stringify(state);
  // A custom toJSON can replace an otherwise valid root with null/array/primitive.
  if (typeof payload !== 'string' || !payload.startsWith('{')) {
    throw new TypeError('O estado serializado deve ser um objeto.');
  }
  return payload;
}

function validState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Estado persistente inválido; restaure um backup validado.');
  }
  return value;
}

async function initializePostgres(client, key, initialState) {
  await client.query('BEGIN');
  try {
    await client.query(POSTGRES_SCHEMA);
    await client.query(
      `INSERT INTO manifestacao_state (state_key, schema_version, payload)
        VALUES ($1, 1, $2::jsonb) ON CONFLICT (state_key) DO NOTHING`,
      [key, snapshot(initialState)],
    );
    await client.query('COMMIT');
  } catch (cause) {
    await client.query('ROLLBACK').catch(() => {});
    throw cause;
  }
  const result = await client.query(
    'SELECT schema_version, revision, payload FROM manifestacao_state WHERE state_key = $1',
    [key],
  );
  const row = result.rows[0];
  if (!row || Number(row.schema_version) !== 1)
    throw new Error('Versão de estado PostgreSQL não suportada.');
  const revision = Number(row.revision);
  const state = { ...structuredClone(initialState), ...validState(row.payload) };
  return { revision, state };
}

async function createPostgresPool(options, connectionString) {
  const Pool = options.Pool ?? (await import('pg')).default.Pool;
  return new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
    query_timeout: 20000,
  });
}

export async function openPostgresPersistence(options = {}) {
  const { connectionString, key = 'manifestacao', initialState = {}, onError } = options;
  if (!connectionString) throw new Error('DATABASE_URL é obrigatória para PostgreSQL.');
  const pool = await createPostgresPool(options, connectionString);
  const lock = BigInt(
    `0x${createHash('sha256').update(`manifestacao:${key}`).digest('hex').slice(0, 15)}`,
  ).toString();
  let client;
  let locked = false;
  let error = null;
  let closed = false;
  let revision = 0;
  let pending = null;
  let worker = null;
  let writing = false;
  let closePromise = null;
  let requestedSequence = 0;
  let committedSequence = 0;
  const barriers = new Set();
  const settleBarriers = () => {
    for (const barrier of barriers) {
      if (error || barrier.sequence <= committedSequence) {
        barriers.delete(barrier);
        if (error) barrier.reject(error);
        else barrier.resolve();
      }
    }
  };
  const fail = (cause) => {
    if (!error) {
      error = new Error(
        'Falha na persistência PostgreSQL; o servidor deve interromper alterações.',
        { cause },
      );
      try {
        onError?.(error);
      } catch {
        /* the original storage failure remains authoritative */
      }
      settleBarriers();
    }
    return error;
  };
  try {
    client = await pool.connect();
    client.on?.('error', fail);
    pool.on?.('error', fail);
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1::bigint) AS locked', [
      lock,
    ]);
    locked = lockResult.rows[0]?.locked === true;
    if (!locked) throw new Error('Já existe outro servidor gravando este estado PostgreSQL.');
    const initialized = await initializePostgres(client, key, initialState);
    revision = initialized.revision;
    const { state } = initialized;
    const drain = async () => {
      while (pending !== null && !error) {
        const { payload, sequence } = pending;
        pending = null;
        writing = true;
        try {
          await client.query('BEGIN');
          const saved = await client.query(
            `UPDATE manifestacao_state
            SET payload = $2::jsonb, revision = revision + 1, updated_at = now()
            WHERE state_key = $1 AND schema_version = 1 RETURNING revision`,
            [key, payload],
          );
          if (saved.rowCount !== 1) throw new Error('Documento persistente não encontrado.');
          await client.query('COMMIT');
          revision = Number(saved.rows[0].revision);
          committedSequence = sequence;
          settleBarriers();
        } catch (cause) {
          await client.query('ROLLBACK').catch(() => {});
          fail(cause);
        } finally {
          writing = false;
        }
      }
    };
    const startWorker = () => {
      worker = drain().finally(() => {
        worker = null;
        // A caller may enqueue between drain resolution and this microtask.
        if (pending !== null && !error) startWorker();
      });
    };
    const adapter = {
      state,
      save(value = adapter.state) {
        if (error) throw error;
        if (closed) throw new Error('Persistência encerrada.');
        // Serialize now: later in-memory mutations cannot alter a queued save.
        // Only the latest waiting snapshot is retained to bound queue memory.
        const payload = snapshot(value);
        pending = { payload, sequence: ++requestedSequence };
        if (!worker) startWorker();
      },
      async flush() {
        if (error) throw error;
        // A later save must not prolong confirmation of this caller's snapshot.
        // A coalesced newer snapshot also durably includes this sequence.
        const sequence = requestedSequence;
        if (committedSequence >= sequence) return;
        await new Promise((resolve, reject) => {
          barriers.add({ sequence, resolve, reject });
        });
      },
      health() {
        return {
          ok: !error && !closed,
          backend: 'postgresql',
          revision,
          pending: writing || pending !== null,
          ...(error ? { error: 'persistence_unavailable' } : {}),
        };
      },
      close() {
        if (closePromise) return closePromise;
        closed = true;
        closePromise = (async () => {
          let failure;
          try {
            await adapter.flush();
          } catch (cause) {
            failure = cause;
          }
          // Even a failed barrier can leave a query/rollback in progress.
          // Release the client only after the writer has completely stopped.
          while (worker) await worker;
          try {
            if (locked) await client.query('SELECT pg_advisory_unlock($1::bigint)', [lock]);
          } catch (cause) {
            failure ??= fail(cause);
          } finally {
            client.release(Boolean(error));
            await pool.end();
          }
          if (failure) throw failure;
        })();
        return closePromise;
      },
    };
    return adapter;
  } catch (cause) {
    if (client) {
      if (locked)
        await client.query('SELECT pg_advisory_unlock($1::bigint)', [lock]).catch(() => {});
      client.release(true);
    }
    await pool.end();
    throw new Error(
      `Não foi possível abrir a persistência PostgreSQL: ${cause.message?.includes('outro servidor') ? 'outro servidor já mantém o bloqueio.' : 'verifique o banco e a versão do estado.'}`,
      { cause },
    );
  }
}

/** Production never reads or writes state.json. Local mode retains compatibility. */
export async function createPersistence({ dataDir, defaults = {}, config = {}, ...options } = {}) {
  const databaseUrl =
    config.databaseUrl ?? config.databaseURL ?? config.connectionString ?? process.env.DATABASE_URL;
  const production = config.production ?? process.env.NODE_ENV === 'production';
  if (databaseUrl)
    return openPostgresPersistence({
      ...options,
      connectionString: databaseUrl,
      initialState: defaults,
      key: config.databaseStateKey ?? 'manifestacao',
    });
  if (production) throw new Error('Produção exige PostgreSQL configurado em DATABASE_URL.');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const stateFile = path.join(dataDir, 'state.json');
  let state = structuredClone(defaults);
  try {
    state = { ...state, ...validState(JSON.parse(fs.readFileSync(stateFile, 'utf8'))) };
  } catch (cause) {
    // Only an absent snapshot permits defaults. existsSync also hides access
    // failures, which could otherwise allow overwriting an unreadable snapshot.
    if (cause.code !== 'ENOENT') {
      throw new Error(
        `Estado local inválido em ${stateFile}; preserve o arquivo antes de reparar.`,
        { cause },
      );
    }
  }
  let error = null;
  let closed = false;
  const adapter = {
    state,
    save(value = adapter.state) {
      if (error) throw error;
      if (closed) throw new Error('Persistência encerrada.');
      const payload = snapshot(value);
      const temp = `${stateFile}.${randomUUID()}.tmp`;
      try {
        // Exclusive creation prevents reuse of stale files with unsafe permissions
        // or following a pre-existing symlink at the temporary path.
        const fd = fs.openSync(temp, 'wx', 0o600);
        try {
          fs.writeFileSync(fd, payload);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        fs.renameSync(temp, stateFile);
        // Persist the rename too before flush/HTTP can confirm this snapshot.
        const directory = fs.openSync(dataDir, 'r');
        try {
          fs.fsyncSync(directory);
        } finally {
          fs.closeSync(directory);
        }
      } catch (cause) {
        try {
          fs.rmSync(temp, { force: true });
        } catch {
          // Preserve the storage error even when cleanup is unavailable.
        }
        error = cause;
        try {
          options.onError?.(error);
        } catch {
          // The original storage failure remains authoritative.
        }
        throw cause;
      }
    },
    async flush() {
      if (error) throw error;
    },
    async close() {
      closed = true;
      await adapter.flush();
    },
    health() {
      return { ok: !error && !closed, backend: 'json', pending: false };
    },
  };
  return adapter;
}
