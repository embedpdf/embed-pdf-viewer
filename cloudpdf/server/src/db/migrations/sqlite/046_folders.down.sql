-- pragma: no-transaction
-- Down for 046_folders.sql (SQLite).
--
-- `documents.folder_id` carries a foreign key, and SQLite refuses
-- `ALTER TABLE ... DROP COLUMN` for such a column, so documents is rebuilt
-- with the documented table-rebuild procedure (see
-- 007_document_security.down.sql for why it runs outside a transaction
-- with foreign keys off). The rebuilt shape is documents as of migration
-- 045, with every index it had.

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
  doc_version        INTEGER NOT NULL DEFAULT 1,
  encryption_state   TEXT NOT NULL DEFAULT 'unknown'
    CHECK (encryption_state IN ('unknown','none','encrypted','unsupported')),
  encryption_requires_password INTEGER,
  security_handler_revision    INTEGER,
  pdf_permissions_bits         INTEGER,
  pdf_permissions_all_allowed  INTEGER,
  pdf_opened_as      TEXT
    CHECK (pdf_opened_as IS NULL OR pdf_opened_as IN ('none','user','owner')),
  security_probed_at INTEGER,
  thumbnail_state    TEXT NOT NULL DEFAULT 'pending',
  thumbnail_key      TEXT NULL,
  expected_sha256    TEXT NULL,
  expected_size_bytes INTEGER NULL,
  upload_kind        TEXT NULL,
  upload_expires_at  INTEGER NULL,
  name               TEXT NOT NULL DEFAULT '',
  name_key           TEXT NOT NULL DEFAULT ''
);

INSERT INTO documents_new
  (id, tenant_id, state, base_sha, storage_size_bytes, metadata_json,
   idempotency_key, failure_reason, created_at, updated_at, created_by, doc_version,
   encryption_state, encryption_requires_password, security_handler_revision,
   pdf_permissions_bits, pdf_permissions_all_allowed, pdf_opened_as, security_probed_at,
   thumbnail_state, thumbnail_key, expected_sha256, expected_size_bytes, upload_kind,
   upload_expires_at, name, name_key)
  SELECT id, tenant_id, state, base_sha, storage_size_bytes, metadata_json,
         idempotency_key, failure_reason, created_at, updated_at, created_by, doc_version,
         encryption_state, encryption_requires_password, security_handler_revision,
         pdf_permissions_bits, pdf_permissions_all_allowed, pdf_opened_as, security_probed_at,
         thumbnail_state, thumbnail_key, expected_sha256, expected_size_bytes, upload_kind,
         upload_expires_at, name, name_key
    FROM documents;

DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;

CREATE INDEX idx_documents_tenant_state ON documents(tenant_id, state);
CREATE INDEX idx_documents_tenant_base_sha ON documents(tenant_id, base_sha)
  WHERE base_sha IS NOT NULL;
CREATE UNIQUE INDEX uq_documents_tenant_idempotency
  ON documents(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_documents_tenant_created_id
  ON documents(tenant_id, created_at DESC, id DESC);
CREATE INDEX idx_documents_tenant_name_key_id
  ON documents(tenant_id, name_key, id);
CREATE INDEX idx_documents_tenant_size_id
  ON documents(tenant_id, COALESCE(storage_size_bytes, 0), id);

DROP TABLE folders;

PRAGMA foreign_keys=ON;
