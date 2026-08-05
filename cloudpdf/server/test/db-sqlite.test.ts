import { createSqliteDb } from '../src/db/drivers/sqlite';
import { migrate } from '../src/db/migrator/runner';
import { sqliteMigrations } from '../src/db/migrations/sqlite/index';
import { runDbConformance } from './_helpers/db-conformance';

runDbConformance({
  label: 'sqlite',
  makeDb: async () => {
    const db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    return db;
  },
  destroyDb: async (db) => {
    await db.destroy();
  },
});
