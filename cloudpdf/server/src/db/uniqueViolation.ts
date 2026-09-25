/**
 * Whether a failed write broke a unique index, on either database:
 * better-sqlite3 reports `SQLITE_CONSTRAINT_UNIQUE` ("UNIQUE constraint
 * failed: …"), Postgres SQLSTATE 23505 ("duplicate key value violates
 * unique constraint …").
 */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === '23505') return true;
  return /UNIQUE constraint failed|duplicate key value/i.test(e.message ?? '');
}
