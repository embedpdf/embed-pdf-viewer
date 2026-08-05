-- Phase 1 initial schema (SQLite).
--
-- Mirrors the logical schema in db/schema.ts. Phase 2 ships an
-- equivalent file under db/migrations/postgres/001_initial.sql with
-- the same logical shape; the conformance test asserts both dialects
-- reach the same column set.

CREATE TABLE tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  config_json TEXT,
  created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE TABLE documents (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  state              TEXT NOT NULL CHECK (state IN ('pending','ready','failed','deleting')),
  base_sha           TEXT,
  storage_size_bytes INTEGER,
  metadata_json      TEXT,
  idempotency_key    TEXT,
  failure_reason     TEXT,
  created_at         INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at         INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  created_by         TEXT
);

CREATE INDEX idx_documents_tenant_state ON documents(tenant_id, state);

CREATE INDEX idx_documents_tenant_base_sha ON documents(tenant_id, base_sha)
  WHERE base_sha IS NOT NULL;

CREATE UNIQUE INDEX uq_documents_tenant_idempotency
  ON documents(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
