import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPersistence, openPostgresPersistence, POSTGRES_SCHEMA } from '../src/persistence.js';

function database() {
  const db = {
    row: null,
    locked: false,
    events: [],
    failUpdates: false,
    failCommit: false,
    missingUpdateRow: false,
    updateGate: null,
    updateGates: [],
    clientEvents: new Map(),
    poolEvents: new Map(),
  };
  db.Pool = class {
    constructor() {
      this.released = false;
    }
    on(name, handler) {
      db.poolEvents.set(name, handler);
    }
    async connect() {
      const pool = this;
      return {
        on(name, handler) {
          db.clientEvents.set(name, handler);
        },
        release() {
          pool.released = true;
        },
        async query(sql, values) {
          db.events.push(sql);
          if (sql.includes('pg_try_advisory_lock')) {
            if (db.locked) return { rows: [{ locked: false }] };
            db.locked = true;
            return { rows: [{ locked: true }] };
          }
          if (sql.includes('pg_advisory_unlock')) {
            db.locked = false;
            return { rows: [] };
          }
          if (sql.startsWith('INSERT')) {
            db.row ??= { schema_version: 1, revision: 0, payload: JSON.parse(values[1]) };
          }
          if (sql.startsWith('SELECT schema_version')) return { rows: [structuredClone(db.row)] };
          if (sql.startsWith('UPDATE')) {
            await (db.updateGates.shift() ?? db.updateGate);
            if (db.failUpdates) throw new Error('disco indisponível');
            if (db.missingUpdateRow) return { rowCount: 0, rows: [] };
            db.staged = {
              ...db.row,
              revision: db.row.revision + 1,
              payload: JSON.parse(values[1]),
            };
            return { rowCount: 1, rows: [{ revision: db.staged.revision }] };
          }
          if (sql === 'COMMIT' && db.staged) {
            if (db.failCommit) throw new Error('commit indisponível');
            db.row = db.staged;
            db.staged = null;
          }
          if (sql === 'ROLLBACK') db.staged = null;
          return { rows: [] };
        },
      };
    }
    async end() {
      this.ended = true;
    }
  };
  return db;
}
const open = (db, options = {}) =>
  openPostgresPersistence({
    connectionString: 'postgres://fixture',
    Pool: db.Pool,
    initialState: { users: [], world: {} },
    ...options,
  });

test('PostgreSQL cria schema, mantém snapshots imutáveis e recarrega estado com revisão', async () => {
  const db = database();
  const store = await open(db);
  store.state.users.push({ id: 'fixture' });
  store.save();
  store.state.users[0].id = 'não salvo';
  await store.flush();
  assert.equal(db.row.payload.users[0].id, 'fixture');
  assert.equal(store.health().revision, 1);
  assert.ok(db.events.includes(POSTGRES_SCHEMA));
  const update = db.events.findIndex((sql) => sql.startsWith('UPDATE'));
  assert.equal(db.events[update - 1], 'BEGIN');
  assert.equal(db.events[update + 1], 'COMMIT');
  await store.close();
  assert.equal(db.locked, false);
  const reopened = await open(db);
  assert.equal(reopened.state.users[0].id, 'fixture');
  await reopened.close();
});

test('PostgreSQL impede dois escritores e libera bloqueio ao fechar', async () => {
  const db = database();
  const store = await open(db);
  await assert.rejects(open(db), /outro servidor/);
  assert.equal(db.locked, true);
  await store.close();
  const next = await open(db);
  await next.close();
});

test('fila limitada preserva snapshot mais recente e flush aguarda gravações', async () => {
  const db = database();
  const store = await open(db);
  let release;
  db.updateGate = new Promise((resolve) => {
    release = resolve;
  });
  store.state.world.n = 1;
  store.save();
  for (let n = 2; n <= 200; n++) {
    store.state.world.n = n;
    store.save();
  }
  assert.equal(store.health().pending, true);
  release();
  await store.flush();
  assert.equal(db.row.payload.world.n, 200);
  assert.equal(db.events.filter((sql) => sql.startsWith('UPDATE')).length, 2);
  assert.equal(store.health().pending, false);
  await store.close();
});

test('flush confirma sua sequência sem esperar snapshots enfileirados depois', async () => {
  const db = database();
  const store = await open(db);
  let releaseFirst, releaseSecond;
  db.updateGates.push(
    new Promise((resolve) => {
      releaseFirst = resolve;
    }),
    new Promise((resolve) => {
      releaseSecond = resolve;
    }),
  );
  store.save({ n: 1 });
  const first = store.flush();
  store.save({ n: 2 });
  let firstConfirmed = false;
  first.then(() => {
    firstConfirmed = true;
  });
  releaseFirst();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(firstConfirmed, true);
  assert.equal(db.row.payload.n, 1);
  assert.equal(store.health().pending, true);
  releaseSecond();
  await store.close();
  assert.equal(db.row.payload.n, 2);
});

test('flush de snapshot coalescido espera commit que incorpora sua sequência', async () => {
  const db = database();
  const store = await open(db);
  let releaseFirst, releaseSecond;
  db.updateGates.push(
    new Promise((resolve) => {
      releaseFirst = resolve;
    }),
    new Promise((resolve) => {
      releaseSecond = resolve;
    }),
  );
  store.save({ n: 1 });
  store.save({ n: 2 });
  const confirmation = store.flush();
  store.save({ n: 3 });
  let confirmed = false;
  confirmation.then(() => {
    confirmed = true;
  });
  releaseFirst();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(confirmed, false);
  releaseSecond();
  await confirmation;
  assert.equal(db.row.payload.n, 3);
  assert.equal(store.health().revision, 2);
  await store.close();
});

test('falha SQL faz rollback, sinaliza indisponibilidade e rejeita novas gravações', async () => {
  const db = database();
  let failures = 0;
  const store = await open(db, {
    onError() {
      failures++;
    },
  });
  db.failUpdates = true;
  store.state.world.n = 1;
  store.save();
  await assert.rejects(store.flush(), /Falha na persistência/);
  assert.equal(db.row.payload.world.n, undefined);
  assert.ok(db.events.includes('ROLLBACK'));
  assert.equal(store.health().ok, false);
  assert.equal(failures, 1);
  assert.throws(() => store.save(), /Falha na persistência/);
  await assert.rejects(store.close(), /Falha na persistência/);
  assert.equal(db.locked, false);
});

test('falha de gravação rejeita todas as barreiras pendentes', async () => {
  const db = database();
  const store = await open(db);
  let release;
  db.updateGate = new Promise((resolve) => {
    release = resolve;
  });
  store.save({ n: 1 });
  const first = assert.rejects(store.flush(), /Falha na persistência/);
  store.save({ n: 2 });
  const second = assert.rejects(store.flush(), /Falha na persistência/);
  db.failUpdates = true;
  release();
  await Promise.all([first, second]);
  assert.equal(store.health().revision, 0);
  await assert.rejects(store.close(), /Falha na persistência/);
  assert.equal(db.locked, false);
});

test('estado inválido ou versão desconhecida impede abertura e libera lock', async () => {
  for (const row of [
    { schema_version: 2, revision: 0, payload: {} },
    { schema_version: 1, revision: 0, payload: [] },
  ]) {
    const db = database();
    db.row = row;
    await assert.rejects(open(db), /Não foi possível abrir/);
    assert.equal(db.locked, false);
  }
});

test('produção exige PostgreSQL e ignora arquivo JSON local quando configurado', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-persistence-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dataDir, 'state.json'), 'inválido');
  await assert.rejects(
    createPersistence({ dataDir, config: { production: true } }),
    /exige PostgreSQL/,
  );
  const db = database();
  const store = await createPersistence({
    dataDir,
    defaults: { users: [] },
    config: { production: true, databaseUrl: 'postgres://fixture' },
    Pool: db.Pool,
  });
  store.state.users.push({ id: 'fixture' });
  store.save();
  await store.close();
  assert.equal(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'), 'inválido');
  assert.deepEqual(fs.readdirSync(dataDir), ['state.json']);
});

test('modo local mantém gravação atômica e recarrega JSON', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-persistence-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = await createPersistence({
    dataDir,
    defaults: { users: [] },
    config: { production: false },
  });
  store.state.users.push({ id: 'fixture' });
  store.save();
  await store.close();
  assert.throws(() => store.save(), /encerrada/);
  const next = await createPersistence({
    dataDir,
    defaults: { users: [], world: {} },
    config: { production: false },
  });
  assert.equal(next.state.users[0].id, 'fixture');
  assert.deepEqual(next.state.world, {});
  await next.close();
});

test('close concorrente aguarda a mesma drenagem e solta escritor somente após commit', async () => {
  const db = database();
  const store = await open(db);
  let release;
  db.updateGate = new Promise((resolve) => {
    release = resolve;
  });
  store.state.world.n = 99;
  store.save();
  store.state.world.n = 100;
  store.save();
  const closing = store.close();
  assert.equal(store.close(), closing);
  assert.equal(db.locked, true);
  release();
  await closing;
  assert.equal(db.row.payload.world.n, 100);
  assert.equal(db.locked, false);
  assert.equal(db.events.filter((sql) => sql.includes('pg_advisory_unlock')).length, 1);
});

test('falha no COMMIT não confirma revisão e exige reinício do escritor', async () => {
  const db = database();
  const store = await open(db);
  db.failCommit = true;
  store.state.world.n = 5;
  store.save();
  await assert.rejects(store.flush(), /Falha na persistência/);
  assert.equal(db.row.payload.world.n, undefined);
  assert.equal(store.health().revision, 0);
  assert.equal(store.health().ok, false);
  assert.ok(db.events.includes('ROLLBACK'));
  await assert.rejects(store.close(), /Falha na persistência/);
  assert.equal(db.locked, false);
});

test('documento removido durante execução falha fechado sem confirmar gravação', async () => {
  const db = database();
  const store = await open(db);
  db.missingUpdateRow = true;
  store.save();
  await assert.rejects(store.flush(), /Falha na persistência/);
  assert.equal(store.health().revision, 0);
  assert.throws(() => store.save(), /Falha na persistência/);
  await assert.rejects(store.close(), /Falha na persistência/);
});

test('erro de conexão ociosa invalida prontidão e notifica a aplicação uma única vez', async () => {
  const db = database();
  let failures = 0;
  const store = await open(db, {
    onError() {
      failures++;
    },
  });
  db.clientEvents.get('error')(new Error('conexão encerrada'));
  db.poolEvents.get('error')(new Error('pool encerrado'));
  assert.equal(failures, 1);
  assert.equal(store.health().ok, false);
  assert.equal(store.health().error, 'persistence_unavailable');
  assert.throws(() => store.save(), /Falha na persistência/);
  await assert.rejects(store.flush(), /Falha na persistência/);
  await assert.rejects(store.close(), /Falha na persistência/);
  assert.equal(db.locked, false);
});

test('erro de conexão rejeita flush mas close aguarda query em andamento antes do unlock', async () => {
  const db = database();
  const store = await open(db);
  let release;
  db.updateGate = new Promise((resolve) => {
    release = resolve;
  });
  store.save({ n: 1 });
  const confirmation = assert.rejects(store.flush(), /Falha na persistência/);
  db.clientEvents.get('error')(new Error('conexão perdida durante gravação'));
  await confirmation;
  const closing = assert.rejects(store.close(), /Falha na persistência/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(db.locked, true);
  release();
  await closing;
  assert.equal(db.locked, false);
  const updateIndex = db.events.findIndex((sql) => sql.startsWith('UPDATE'));
  const commitIndex = db.events.indexOf('COMMIT', updateIndex);
  const unlockIndex = db.events.findIndex((sql) => sql.includes('pg_advisory_unlock'));
  assert.ok(commitIndex > updateIndex && unlockIndex > commitIndex);
});

test('snapshots recusam raiz substituída por toJSON sem comprometer o escritor', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-persistence-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const db = database();
  const stores = [
    await createPersistence({ dataDir, config: { production: false } }),
    await open(db),
  ];
  for (const store of stores) {
    for (const value of [null, [], 'invalid', undefined]) {
      assert.throws(() => store.save({ toJSON: () => value }), /serializado/);
    }
    assert.equal(store.health().ok, true);
    store.save({ valid: true });
    await store.flush();
    await store.close();
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8')), {
    valid: true,
  });
  assert.deepEqual(db.row.payload, { valid: true });
});

test('JSON cria temporário privado sem seguir symlink antigo e sincroniza antes da confirmação', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-persistence-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const target = path.join(dataDir, 'preserve.txt');
  fs.writeFileSync(target, 'preservado', { mode: 0o644 });
  fs.symlinkSync(target, path.join(dataDir, 'state.json.tmp'));
  const store = await createPersistence({ dataDir, config: { production: false } });
  const originalSync = fs.fsyncSync;
  const synchronized = [];
  t.mock.method(fs, 'fsyncSync', (fd) => {
    synchronized.push(fs.fstatSync(fd).isDirectory() ? 'directory' : 'file');
    return originalSync(fd);
  });
  store.save({ n: 1 });
  await store.flush();
  assert.deepEqual(synchronized, ['file', 'directory']);
  assert.equal(fs.readFileSync(target, 'utf8'), 'preservado');
  assert.equal(fs.statSync(path.join(dataDir, 'state.json')).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(dataDir).sort(), [
    'preserve.txt',
    'state.json',
    'state.json.tmp',
  ]);
  await store.close();
});

test('JSON mantém snapshot anterior e remove temporário se sincronização do arquivo falha', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-persistence-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = await createPersistence({ dataDir, config: { production: false } });
  store.save({ n: 1 });
  const failure = new Error('disco indisponível');
  t.mock.method(fs, 'fsyncSync', () => {
    throw failure;
  });
  assert.throws(() => store.save({ n: 2 }), failure);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8')), { n: 1 });
  assert.deepEqual(fs.readdirSync(dataDir), ['state.json']);
  assert.equal(store.health().ok, false);
  await assert.rejects(store.flush(), failure);
  await assert.rejects(store.close(), failure);
});

test('JSON falha fechado se fsync do diretório falha após rename, sem prometer rollback em disco', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-persistence-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = await createPersistence({ dataDir, config: { production: false } });
  store.save({ n: 1 });
  const failure = Object.assign(new Error('sincronização do diretório indisponível'), {
    code: 'EIO',
  });
  const originalSync = fs.fsyncSync;
  const sync = t.mock.method(fs, 'fsyncSync', (fd) => {
    if (fs.fstatSync(fd).isDirectory()) throw failure;
    return originalSync(fd);
  });
  assert.throws(() => store.save({ n: 2 }), failure);
  // The rename already happened. Failure means durability is uncertain, not
  // that the previous snapshot is still visible or can safely be restored.
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8')), { n: 2 });
  assert.deepEqual(fs.readdirSync(dataDir), ['state.json']);
  assert.equal(store.health().ok, false);
  assert.throws(() => store.save({ n: 3 }), failure);
  await assert.rejects(store.flush(), failure);
  await assert.rejects(store.close(), failure);
  sync.mock.restore();
  const reopened = await createPersistence({ dataDir, config: { production: false } });
  assert.equal(reopened.state.n, 2);
  await reopened.close();
});

test('JSON notifica falha de disco uma única vez e preserva erro se callback também falhar', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-persistence-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const failures = [];
  const store = await createPersistence({
    dataDir,
    config: { production: false },
    onError(error) {
      failures.push(error);
      throw new Error('falha do observador');
    },
  });
  const failure = new Error('disco indisponível');
  t.mock.method(fs, 'fsyncSync', () => {
    throw failure;
  });
  assert.throws(() => store.save({ n: 1 }), failure);
  assert.deepEqual(failures, [failure]);
  assert.equal(store.health().ok, false);
  assert.throws(() => store.save({ n: 2 }), failure);
  await assert.rejects(store.flush(), failure);
  await assert.rejects(store.close(), failure);
  assert.deepEqual(failures, [failure]);
  assert.deepEqual(fs.readdirSync(dataDir), []);
});

test('JSON não ignora snapshot existente quando a verificação de existência falha', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-persistence-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const stateFile = path.join(dataDir, 'state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ preserved: true }));
  t.mock.method(fs, 'existsSync', () => false);
  const store = await createPersistence({ dataDir, config: { production: false } });
  assert.equal(store.state.preserved, true);
  await store.close();
});

test('JSON recusa inicialização em erro de leitura e preserva snapshot existente', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifestacao-persistence-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const stateFile = path.join(dataDir, 'state.json');
  const original = JSON.stringify({ preserved: true });
  fs.writeFileSync(stateFile, original);
  const failure = Object.assign(new Error('acesso recusado'), { code: 'EACCES' });
  t.mock.method(fs, 'existsSync', () => false);
  const read = t.mock.method(fs, 'readFileSync', () => {
    throw failure;
  });
  await assert.rejects(
    createPersistence({ dataDir, config: { production: false } }),
    (error) => /Estado local inválido/.test(error.message) && error.cause === failure,
  );
  read.mock.restore();
  assert.equal(fs.readFileSync(stateFile, 'utf8'), original);
});
