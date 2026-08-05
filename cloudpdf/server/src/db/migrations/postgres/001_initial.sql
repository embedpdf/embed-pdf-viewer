-- Phase 1 initial schema (Postgres).
--
-- Logical mirror of db/migrations/sqlite/001_initial.sql; both files
-- target the same `db/schema.ts` Kysely interface. The repo
-- conformance test runs identical assertions against both dialects.
--
-- Dialect notes:
--   * Timestamps are BIGINT epoch-ms (not TIMESTAMPTZ) so the
--     application layer treats them identically across SQLite and
--     PG without per-driver date coercion. The pg driver's int8
--     -> Number coercion lives in `db/drivers/postgres.ts`.
--   * `metadata_json` is TEXT, not JSONB, to keep the application's
--     stringify/parse roundtrip the same on both dialects. JSONB is
--     an additive future change (column type alter, no data loss).
--   * Partial unique indexes work natively in PG; the SQLite file
--     uses the same syntax (SQLite 3.8+ supports them).

CREATE TABLE tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  config_json TEXT,
  created_at  BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT
);

CREATE TABLE documents (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  state              TEXT NOT NULL CHECK (state IN ('pending','ready','failed','deleting')),
  base_sha           TEXT,
  storage_size_bytes BIGINT,
  metadata_json      TEXT,
  idempotency_key    TEXT,
  failure_reason     TEXT,
  created_at         BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT,
  updated_at         BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT,
  created_by         TEXT
);

CREATE INDEX idx_documents_tenant_state ON documents(tenant_id, state);

CREATE INDEX idx_documents_tenant_base_sha ON documents(tenant_id, base_sha)
  WHERE base_sha IS NOT NULL;

CREATE UNIQUE INDEX uq_documents_tenant_idempotency
  ON documents(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
