-- pragma: no-transaction
-- Down for 007_document_security.sql (SQLite).
--
-- 007 added seven columns to `documents`, two of which carry CHECK
-- constraints (encryption_state, pdf_opened_as). SQLite refuses
-- `ALTER TABLE ... DROP COLUMN` for a column referenced by a CHECK, so
-- we use the documented table-rebuild procedure instead. The rebuild
-- needs foreign_keys OFF (other tables FK -> documents), and PRAGMA
-- foreign_keys is a no-op inside a transaction — hence the
-- `no-transaction` directive above so the runner executes statement by
-- statement.
--
-- The rebuilt shape is documents as of migration 003: the original
-- 001_initial columns plus doc_version. Restores structure, not the
-- dropped security columns' data (standard rollback caveat).

PRAGMA foreign_keys=OFF;

CREATE TABLE documents_new (
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
  created_by         TEXT,
  doc_version        INTEGER NOT NULL DEFAULT 1
);

INSERT INTO documents_new
  (id, tenant_id, state, base_sha, storage_size_bytes, metadata_json,
   idempotency_key, failure_reason, created_at, updated_at, created_by, doc_version)
  SELECT id, tenant_id, state, base_sha, storage_size_bytes, metadata_json,
         idempotency_key, failure_reason, created_at, updated_at, created_by, doc_version
    FROM documents;

DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;

CREATE INDEX idx_documents_tenant_state ON documents(tenant_id, state);

CREATE INDEX idx_documents_tenant_base_sha ON documents(tenant_id, base_sha)
  WHERE base_sha IS NOT NULL;

CREATE UNIQUE INDEX uq_documents_tenant_idempotency
  ON documents(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

PRAGMA foreign_keys=ON;
