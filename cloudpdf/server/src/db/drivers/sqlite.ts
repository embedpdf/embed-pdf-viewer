import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as Schema } from '../schema';

export interface CreateSqliteDbOptions {
  /**
   * Filesystem path to the SQLite database file. Pass `:memory:` for
   * in-process tests.
   */
  path: string;
  /**
   * If true, sets `journal_mode=WAL` and `synchronous=NORMAL`.
   * Recommended for multi-connection workloads; default true.
   */
  wal?: boolean;
  /**
   * Optional logger; receives query strings (sans parameters) for
   * diagnostics. Production deployments wire this to the Fastify logger.
   */
  logQueries?: (sql: string) => void;
}

/**
 * Build a Kysely instance backed by `better-sqlite3`. SQLite is the
 * primary dialect for Phase 1; Postgres lands in Phase 2 via a parallel
 * driver in `db/drivers/postgres.ts`.
 *
 * Pragmas applied at boot:
 * - `journal_mode=WAL` for safe concurrent readers + writer
 * - `synchronous=NORMAL` (durable across crashes, fast)
 * - `foreign_keys=ON` for cascade-delete on documents -> layers later
 * - `busy_timeout=5000` so writers don't fail under brief contention
 */
export function createSqliteDb(opts: CreateSqliteDbOptions): Kysely<Schema> {
  const sqlite = new Database(opts.path);

  if (opts.wal !== false && opts.path !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  return new Kysely<Schema>({
    dialect: new SqliteDialect({ database: sqlite }),
    log: opts.logQueries
      ? (event) => {
          if (event.level === 'query') opts.logQueries?.(event.query.sql);
        }
      : undefined,
  });
}
