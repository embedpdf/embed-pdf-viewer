-- Down for 044_versions_by_layer.sql (SQLite). The table goes back to one
-- numbering per document; documents moved back to their upload stay there.
CREATE TABLE base_versions_by_document (
  tenant_id           TEXT    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_id              TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  sha256              TEXT    NOT NULL,
  byte_length         INTEGER NOT NULL,
  number              INTEGER NOT NULL,
  parent_sha256       TEXT,
  producer_kind       TEXT    NOT NULL CHECK (producer_kind IN ('upload', 'signature')),
  producer_ref        TEXT,
  storage_key         TEXT,
  layout_version      INTEGER NOT NULL DEFAULT 1,
  metadata_version    INTEGER NOT NULL DEFAULT 1,
  attachments_version INTEGER NOT NULL DEFAULT 1,
  annotations_version INTEGER NOT NULL DEFAULT 1,
  forms_version       INTEGER NOT NULL DEFAULT 1,
  outline_version     INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,
  PRIMARY KEY (doc_id, sha256),
  UNIQUE (doc_id, number)
);
INSERT INTO base_versions_by_document
  (tenant_id, doc_id, sha256, byte_length, number, parent_sha256, producer_kind, producer_ref,
   storage_key, layout_version, metadata_version, attachments_version, annotations_version,
   forms_version, outline_version, created_at)
SELECT tenant_id, doc_id, sha256, byte_length, number, parent_sha256, producer_kind,
       producer_ref, storage_key, layout_version, metadata_version, attachments_version,
       annotations_version, forms_version, outline_version, created_at
FROM base_versions;
DROP TABLE base_versions;
ALTER TABLE base_versions_by_document RENAME TO base_versions;
