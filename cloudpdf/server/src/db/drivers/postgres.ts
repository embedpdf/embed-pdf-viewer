import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database as Schema } from '../schema';

const { Pool, types: pgTypes } = pg;

/**
 * Postgres OID 20 is `int8` (BIGINT). By default `node-postgres`
 * returns BIGINT values as **strings** to avoid silent precision loss
 * on values > 2^53. All of our BIGINT columns are either:
 *   - epoch-ms timestamps (created_at, updated_at, expires_at) — 13
 *     digits, comfortably inside JS Number range until Sat Sep 13
 *     275760, AD,
 *   - byte counts (storage_size_bytes) — petabyte-scale before we hit
 *     2^53.
 *
 * Both are safe to coerce to `number`. Coerce here once, at the
 * driver level, instead of poisoning every repo with `Number(...)`
 * conversions.
 *
 * If we later add a column that genuinely needs `bigint` precision
 * (e.g. a UUIDv7 64-bit timestamp), gate the coercion on column
 * name via a per-column type parser at the query layer.
 */
const PG_OID_INT8 = 20;
pgTypes.setTypeParser(PG_OID_INT8, (val) => (val === null ? null : Number(val)));

export interface CreatePostgresDbOptions {
  /**
   * Postgres connection string (e.g.
   * `postgres://user:pass@host:5432/dbname?sslmode=require`).
   * Standard `libpq` URL shape.
   */
  connectionString: string;
  /** Connection pool sizing. Defaults sane for a single Fastify process. */
  poolMin?: number;
  poolMax?: number;
  /** Idle pool member timeout in ms. */
  idleTimeoutMs?: number;
  /** Statement-level timeout (per-query). 0 disables. Defaults 30s. */
  statementTimeoutMs?: number;
  /** Query log hook. */
  logQueries?: (sql: string) => void;
}

/**
 * Build a Kysely instance backed by `pg.Pool`. Mirrors `createSqliteDb`
 * in `./sqlite.ts`; pick the right driver factory based on deployment
 * config. The repo layer is dialect-agnostic.
 *
 * Production knobs applied at boot:
 *   - `statement_timeout` so a misbehaving query can't block a
 *     connection forever (defaults to 30s)
 *   - `application_name` for `pg_stat_activity` triage during incidents
 *   - `idleTimeoutMillis` to recycle idle connections so PG doesn't
 *     accumulate them until `idle_in_transaction_session_timeout` fires
 */
export function createPostgresDb(opts: CreatePostgresDbOptions): Kysely<Schema> {
  const statementTimeoutMs = opts.statementTimeoutMs ?? 30_000;
  // `application_name` and `statement_timeout` are first-class
  // `node-postgres` config properties — pg sends them in the
  // `StartupMessage` so every connection (including reconnects) picks
  // them up atomically. Don't use `pool.on('connect', SET ...)` for
  // these: the SET is async and races with `pool.destroy()`, which is
  // exactly the failure path that shows up as PG code 57P01
  // ("terminating connection due to administrator command") in tests.
  const pool = new Pool({
    connectionString: opts.connectionString,
    min: opts.poolMin ?? 0,
    max: opts.poolMax ?? 10,
    idleTimeoutMillis: opts.idleTimeoutMs ?? 10_000,
    application_name: 'cloudpdf-server',
    statement_timeout: statementTimeoutMs > 0 ? statementTimeoutMs : undefined,
  });

  return new Kysely<Schema>({
    dialect: new PostgresDialect({ pool }),
    log: opts.logQueries
      ? (event) => {
          if (event.level === 'query') opts.logQueries?.(event.query.sql);
        }
      : undefined,
  });
}
