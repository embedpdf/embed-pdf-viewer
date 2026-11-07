import { createSqliteDb, migrate, sqliteMigrations } from '../src/index';
import { runDocPlaneTenantJwt } from './_helpers/doc-plane-tenant-jwt-suite';

runDocPlaneTenantJwt({
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
