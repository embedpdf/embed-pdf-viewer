/**
 * Whether a failed write broke a foreign key, on either database:
 * better-sqlite3 reports `SQLITE_CONSTRAINT_FOREIGNKEY`, Postgres error
 * code 23503 (`violates foreign key constraint`).
 */
export function isForeignKeyViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || e.code === '23503') return true;
  return /FOREIGN KEY constraint failed|violates foreign key constraint/i.test(e.message ?? '');
}
