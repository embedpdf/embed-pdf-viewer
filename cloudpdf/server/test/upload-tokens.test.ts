import { createSqliteDb, migrate, sqliteMigrations } from '../src/index';
import { runUploadTokens } from './_helpers/upload-tokens-suite';

runUploadTokens({
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
