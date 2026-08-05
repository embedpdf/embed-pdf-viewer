import { createSqliteDb, migrate, sqliteMigrations } from '../src/index';
import { runAdminE2e } from './_helpers/admin-e2e-suite';

runAdminE2e({
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
