import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql, type Kysely } from 'kysely';
import type { Database as Schema } from '../schema';

/**
 * Input migration: either supplied in-memory (preferred — survives
 * bundling cleanly) or discovered from a directory of `.sql` files.
 */
export interface MigrationSource {
  /** Sort key. Zero-padded integer string (e.g. `001`). */
  version: string;
  /** Human-readable filename for diagnostics, e.g. `001_initial.sql`. */
  name: string;
  /** Raw SQL text. May contain multiple `;`-separated statements. */
  sql: string;
  /**
   * Optional inverse SQL applied by `migrateDown` to undo `sql`. Same
   * multi-statement + `-- pragma: no-transaction` rules as `sql`. When
   * absent or empty the migration is considered irreversible and
   * `migrateDown` refuses to roll past it.
   */
  down?: string;
}

export interface MigrationRecord {
  version: string;
  name: string;
  checksum: string;
  applied_at: number;
}

export type MigrateInput =
  | { kind: 'inline'; migrations: ReadonlyArray<MigrationSource> }
  | { kind: 'dir'; dir: string };

export interface MigrateOptions {
  source: MigrateInput;
  /** Called once per migration before it is applied. */
  onApply?: (m: MigrationSource) => void;
}

/** A single line of the `migrate status` table. */
export interface MigrationStatusEntry {
  version: string;
  /** Filename from code (or `?` if missing from code). */
  name: string;
  state: 'applied' | 'pending' | 'orphan' | 'drift';
  /** Set for `applied` + `drift` + `orphan` rows. */
  appliedAt?: number;
  /** Set for `drift` rows: codeChecksum vs dbChecksum. */
  drift?: { dbChecksum: string; codeChecksum: string };
  /**
   * True when the migration declares `down` SQL and can therefore be
   * rolled back by `migrateDown`. Undefined for `orphan` rows (no code).
   */
  reversible?: boolean;
}

export type DriftKind = 'checksum_mismatch' | 'missing_in_code' | 'renamed' | 'unknown_in_db';

export interface DriftIssue {
  kind: DriftKind;
  version: string;
  message: string;
}

/**
 * Apply every pending migration. Forward-only; checksums of
 * already-applied migrations are validated to detect silent edits.
 *
 * Migration directives in the SQL text:
 *   `-- pragma: no-transaction`  Disables the implicit transaction
 *                                 (Postgres `CREATE INDEX CONCURRENTLY`).
 *
 * The `inline` source kind is the default for our codebase: migrations
 * are TypeScript modules that embed their SQL as a string. This makes
 * the migration set part of the bundle, so packagers / Docker images
 * don't need to ship extra `.sql` files.
 */
export async function migrate(
  db: Kysely<Schema>,
  opts: MigrateOptions,
): Promise<MigrationSource[]> {
  await ensureMigrationsTable(db);
  const migrations =
    opts.source.kind === 'inline'
      ? sortByVersion([...opts.source.migrations])
      : await discoverMigrations(opts.source.dir);
  const applied = await listApplied(db);
  validateRenames(migrations, applied);

  const pending = migrations.filter((m) => !applied.has(m.version));
  for (const m of pending) {
    opts.onApply?.(m);
    await applyOne(db, m);
  }
  return pending;
}

export interface MigrateDownOptions {
  /** Where the migration set (with `down` SQL) comes from. */
  source: MigrateInput;
  /**
   * Roll back every applied migration whose version is strictly greater
   * than `to`, leaving `to` (and everything below it) applied. Use
   * `'000'` to revert the entire history. Takes precedence over `steps`.
   */
  to?: string;
  /**
   * Roll back this many of the highest applied migrations. Default 1.
   * Ignored when `to` or `all` is set.
   */
  steps?: number;
  /** Roll back every applied migration (down to an empty schema). */
  all?: boolean;
  /**
   * Proceed even when an applied migration's stored up-checksum no
   * longer matches the code's `sql` (i.e. the migration was edited after
   * apply). Off by default so we never run a `down` that does not match
   * the `up` that is actually in the database.
   */
  force?: boolean;
  /** Called once per migration just before its `down` SQL runs. */
  onRevert?: (m: MigrationSource) => void;
}

/**
 * Reverse applied migrations by running their `down` SQL in descending
 * version order and deleting the corresponding `schema_migrations` row.
 *
 * This is a manual break-glass operation — nothing calls it on boot. It
 * is the symmetric inverse of {@link migrate}:
 *   - Selection: `to` (everything `> to`), else `steps` (the N highest),
 *     else `all`.
 *   - The whole revert set is validated *before* any DB change: each
 *     target must exist in code, its stored up-checksum must still match
 *     `sql` (unless `force`), and it must declare non-empty `down` SQL —
 *     otherwise the migration is irreversible and we refuse.
 *   - Each `down` runs like an `up` (multi-statement, honours
 *     `-- pragma: no-transaction`), then its row is removed so
 *     `migrate up` re-applies it cleanly.
 *
 * Returns the migrations that were reverted (newest first).
 */
export async function migrateDown(
  db: Kysely<Schema>,
  opts: MigrateDownOptions,
): Promise<MigrationSource[]> {
  await ensureMigrationsTable(db);
  const migrations =
    opts.source.kind === 'inline'
      ? sortByVersion([...opts.source.migrations])
      : await discoverMigrations(opts.source.dir);
  const byVersion = new Map(migrations.map((m) => [m.version, m]));
  const applied = await listApplied(db);

  const appliedVersionsDesc = [...applied.keys()].sort().reverse();

  let targetVersions: string[];
  if (opts.all) {
    targetVersions = appliedVersionsDesc;
  } else if (opts.to !== undefined) {
    const to = opts.to;
    targetVersions = appliedVersionsDesc.filter((v) => v > to);
  } else {
    const steps = opts.steps ?? 1;
    targetVersions = appliedVersionsDesc.slice(0, Math.max(0, steps));
  }

  // Resolve + validate the entire revert set before touching the DB so
  // a half-finished rollback can never strand the schema in a state the
  // code cannot describe.
  const plan: MigrationSource[] = [];
  for (const version of targetVersions) {
    const rec = applied.get(version)!;
    const m = byVersion.get(version);
    if (!m) {
      throw new Error(
        `migrator: cannot roll back ${version} (${rec.name}): no migration source in code`,
      );
    }
    if (!opts.force) {
      const codeChecksum = sha256(m.sql);
      if (codeChecksum !== rec.checksum) {
        throw new Error(
          `migrator: cannot roll back ${version} (${m.name}): up-checksum drift ` +
            `(db=${rec.checksum.slice(0, 12)}.. code=${codeChecksum.slice(0, 12)}..); ` +
            `pass force to override`,
        );
      }
    }
    if (!isReversible(m)) {
      throw new Error(`migrator: migration ${version} (${m.name}) is irreversible (no down SQL)`);
    }
    plan.push(m);
  }

  const reverted: MigrationSource[] = [];
  for (const m of plan) {
    opts.onRevert?.(m);
    await applyDown(db, m);
    reverted.push(m);
  }
  return reverted;
}

function isReversible(m: MigrationSource): boolean {
  return typeof m.down === 'string' && m.down.trim().length > 0;
}

async function ensureMigrationsTable(db: Kysely<Schema>): Promise<void> {
  // BIGINT, not INTEGER: epoch-ms timestamps (13 digits) overflow PG's
  // 4-byte INTEGER (max ~2.14B). SQLite treats `BIGINT` as an alias for
  // its variable-width INTEGER affinity, so the same DDL works on both
  // dialects.
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      checksum   TEXT NOT NULL,
      applied_at BIGINT NOT NULL
    )
  `.execute(db);
}

async function discoverMigrations(dir: string): Promise<MigrationSource[]> {
  const entries = await readdir(dir);
  const out: MigrationSource[] = [];
  // `NNN_name.down.sql` files are inverses, not standalone migrations.
  // Collect them first, then attach onto their matching up entry so the
  // `^(\d+)_(.+)\.sql$` up regex never mistakes `011_x.down.sql` for a
  // bogus migration `011`.
  const downByVersion = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.endsWith('.down.sql')) continue;
    const dm = entry.match(/^(\d+)_(.+)\.down\.sql$/);
    if (!dm) {
      throw new Error(`migrator: unrecognised down filename ${entry} (expected NNN_name.down.sql)`);
    }
    downByVersion.set(dm[1]!, await readFile(join(dir, entry), 'utf8'));
  }
  for (const entry of entries) {
    if (!entry.endsWith('.sql') || entry.endsWith('.down.sql')) continue;
    const match = entry.match(/^(\d+)_(.+)\.sql$/);
    if (!match) {
      throw new Error(`migrator: unrecognised filename ${entry} (expected NNN_name.sql)`);
    }
    const text = await readFile(join(dir, entry), 'utf8');
    const version = match[1]!;
    const down = downByVersion.get(version);
    out.push({ version, name: entry, sql: text, ...(down !== undefined ? { down } : {}) });
  }
  return sortByVersion(out);
}

function sortByVersion<T extends { version: string }>(list: T[]): T[] {
  return list.sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
}

/**
 * Report applied / pending / drift state without modifying the DB.
 *
 * Drift = an applied migration whose code has changed since it was
 * applied (checksum mismatch) — a strong signal that a developer
 * edited a migration in-place instead of adding a new one. Production
 * boot refuses to start when drift is detected; `migrate validate` is
 * the corresponding CLI surface.
 */
export async function status(
  db: Kysely<Schema>,
  source: ReadonlyArray<MigrationSource>,
): Promise<MigrationStatusEntry[]> {
  await ensureMigrationsTable(db);
  const migrations = sortByVersion([...source]);
  const applied = await listApplied(db);

  const out: MigrationStatusEntry[] = [];

  // Walk every version present in either set. Some versions can be
  // applied-without-code (orphan: migration file was deleted from the
  // repo) — surface them explicitly so operators see what's going on.
  const allVersions = new Set<string>();
  for (const m of migrations) allVersions.add(m.version);
  for (const v of applied.keys()) allVersions.add(v);
  const sortedVersions = [...allVersions].sort();

  for (const v of sortedVersions) {
    const m = migrations.find((x) => x.version === v);
    const a = applied.get(v);
    if (!m && a) {
      out.push({ version: v, name: a.name, state: 'orphan', appliedAt: a.applied_at });
      continue;
    }
    if (m && !a) {
      out.push({ version: m.version, name: m.name, state: 'pending', reversible: isReversible(m) });
      continue;
    }
    if (m && a) {
      const codeChecksum = sha256(m.sql);
      if (codeChecksum === a.checksum) {
        out.push({
          version: m.version,
          name: m.name,
          state: 'applied',
          appliedAt: a.applied_at,
          reversible: isReversible(m),
        });
      } else {
        out.push({
          version: m.version,
          name: m.name,
          state: 'drift',
          appliedAt: a.applied_at,
          drift: { dbChecksum: a.checksum, codeChecksum },
          reversible: isReversible(m),
        });
      }
    }
  }
  return out;
}

/**
 * Strict drift detection. Returns the list of issues; an empty list
 * means "safe to boot". Call this at server startup behind a flag —
 * see `validateOrThrow` for the production-grade wrapper.
 *
 * Issues we surface:
 *   - `checksum_mismatch` — code edited after apply (the dangerous one)
 *   - `renamed` — filename changed after apply (catches accidental
 *     rename squashes; the `migrate` function already enforces this
 *     when applying, but validate covers boot-time read-only checks)
 *   - `missing_in_code` — applied migration with no corresponding file
 *     (someone deleted a migration; usually a bad merge)
 *   - `unknown_in_db` — pending; not a drift per se but the CLI may
 *     choose to error if `--strict` is passed
 */
export async function validate(
  db: Kysely<Schema>,
  source: ReadonlyArray<MigrationSource>,
  opts: { treatPendingAsDrift?: boolean } = {},
): Promise<DriftIssue[]> {
  await ensureMigrationsTable(db);
  const migrations = sortByVersion([...source]);
  const applied = await listApplied(db);
  const issues: DriftIssue[] = [];

  for (const m of migrations) {
    const a = applied.get(m.version);
    if (!a) {
      if (opts.treatPendingAsDrift) {
        issues.push({
          kind: 'unknown_in_db',
          version: m.version,
          message: `migration ${m.version} (${m.name}) has not been applied`,
        });
      }
      continue;
    }
    if (a.name !== m.name) {
      issues.push({
        kind: 'renamed',
        version: m.version,
        message: `migration ${m.version} was applied as ${a.name} but code has ${m.name}`,
      });
    }
    const codeChecksum = sha256(m.sql);
    if (a.checksum !== codeChecksum) {
      issues.push({
        kind: 'checksum_mismatch',
        version: m.version,
        message:
          `migration ${m.version} (${m.name}) checksum drift: ` +
          `db=${a.checksum.slice(0, 12)}.. code=${codeChecksum.slice(0, 12)}..`,
      });
    }
  }

  // Applied rows with no corresponding code file.
  const codeVersions = new Set(migrations.map((m) => m.version));
  for (const [version, rec] of applied) {
    if (!codeVersions.has(version)) {
      issues.push({
        kind: 'missing_in_code',
        version,
        message:
          `migration ${version} (${rec.name}) is applied but its source file ` +
          `is not present in code — someone deleted a migration after apply`,
      });
    }
  }

  return issues;
}

/**
 * Production boot helper: validates and throws a single multi-line
 * error if any drift is detected. Designed for `buildApp` to call
 * before opening the listening socket. If you want soft warnings,
 * call `validate` directly and log the issues instead.
 */
export async function validateOrThrow(
  db: Kysely<Schema>,
  source: ReadonlyArray<MigrationSource>,
): Promise<void> {
  const issues = await validate(db, source);
  if (issues.length === 0) return;
  const lines = issues.map((i) => `  - [${i.kind}] ${i.message}`).join('\n');
  throw new Error(`migration drift detected:\n${lines}`);
}

async function listApplied(db: Kysely<Schema>): Promise<Map<string, MigrationRecord>> {
  const rows = await db
    .selectFrom('schema_migrations')
    .select(['version', 'name', 'checksum', 'applied_at'])
    .execute();
  const map = new Map<string, MigrationRecord>();
  for (const r of rows) map.set(r.version, r);
  return map;
}

function validateRenames(
  migrations: MigrationSource[],
  applied: Map<string, MigrationRecord>,
): void {
  for (const m of migrations) {
    const a = applied.get(m.version);
    if (a && a.name !== m.name) {
      throw new Error(
        `migrator: applied migration ${m.version} renamed: db has ${a.name}, code has ${m.name}`,
      );
    }
  }
}

async function applyOne(db: Kysely<Schema>, m: MigrationSource): Promise<void> {
  const checksum = sha256(m.sql);
  const noTx = /^\s*--\s*pragma:\s*no-transaction\s*$/im.test(m.sql);
  const statements = splitStatements(m.sql);

  const run = async (tx: Kysely<Schema>) => {
    for (const stmt of statements) {
      await sql.raw(stmt).execute(tx);
    }
    await tx
      .insertInto('schema_migrations')
      .values({ version: m.version, name: m.name, checksum, applied_at: Date.now() })
      .execute();
  };

  if (noTx) {
    await run(db);
  } else {
    await db.transaction().execute(run);
  }
}

async function applyDown(db: Kysely<Schema>, m: MigrationSource): Promise<void> {
  const down = m.down ?? '';
  const noTx = /^\s*--\s*pragma:\s*no-transaction\s*$/im.test(down);
  const statements = splitStatements(down);

  const run = async (tx: Kysely<Schema>) => {
    for (const stmt of statements) {
      await sql.raw(stmt).execute(tx);
    }
    await tx.deleteFrom('schema_migrations').where('version', '=', m.version).execute();
  };

  if (noTx) {
    await run(db);
  } else {
    await db.transaction().execute(run);
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Naive SQL splitter: splits on top-level `;`, respects single- and
 * double-quoted strings and `--` line comments. Sufficient for our
 * migrations which are pure DDL. If we ever embed PG functions /
 * triggers with internal `;`, add a `-- single-statement` marker and
 * a special case here.
 */
function splitStatements(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let inLineComment = false;
  let inString: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1] ?? '';
    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inString) {
      current += ch;
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '-' && next === '-') {
      inLineComment = true;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      current += ch;
      continue;
    }
    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed) out.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail) out.push(tail);
  return out;
}
