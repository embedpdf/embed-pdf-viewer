-- Digital signatures: the base version catalog and the durable signing
-- (sqlite).
--
-- `base_versions`: every immutable PDF a document's head has pointed at.
-- `documents.base_sha` stays the head; a completed signature publishes a
-- new row and moves the head. `storage_key` NULL means the legacy
-- StorageKeys.basePdf(tenant, doc) key (the shard of a docId is a sha256
-- prefix, not computable in SQL). The plane pointers are what the base
-- manifest publishes for that version: version 1 carries the initial
-- epochs; a published version takes the signing layer's pointers.
CREATE TABLE base_versions (
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
  created_at          INTEGER NOT NULL,
  PRIMARY KEY (doc_id, sha256),
  UNIQUE (doc_id, number)
);

-- Version 1 for every document that already has a base.
INSERT INTO base_versions (tenant_id, doc_id, sha256, byte_length, number, parent_sha256,
                           producer_kind, producer_ref, storage_key, created_at)
SELECT tenant_id, id, base_sha, COALESCE(storage_size_bytes, 0), 1, NULL, 'upload', NULL, NULL, created_at
FROM documents WHERE base_sha IS NOT NULL;

-- Which base version each layer's artifact is a delta of. A layer behind
-- the head refuses to prepare a signature (StaleBase) until it is rebased.
ALTER TABLE layers ADD COLUMN base_sha TEXT;
UPDATE layers SET base_sha = (SELECT base_sha FROM documents WHERE documents.id = layers.doc_id);

-- Signings: the durable candidate between prepare and complete. The tail
-- (the candidate's bytes past its base) lives in object storage under
-- `tail_key`; any replica rebuilds base + tail to complete. At most one
-- pending signing per layer (the partial unique index) blocks layer
-- writes; the row's two fences name the base and the layer version the
-- candidate was prepared on.
CREATE TABLE document_signings (
  id                     TEXT    PRIMARY KEY,
  tenant_id              TEXT    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_id                 TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  layer_id               TEXT    NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  layer_name             TEXT    NOT NULL,
  state                  TEXT    NOT NULL CHECK (state IN ('prepared', 'completed', 'aborted', 'expired')),
  expected_base_sha      TEXT    NOT NULL,
  expected_layer_version INTEGER NOT NULL,
  base_byte_length       INTEGER NOT NULL,
  tail_key               TEXT    NOT NULL,
  tail_sha               TEXT    NOT NULL,
  tail_size              INTEGER NOT NULL,
  field_object_number    INTEGER NOT NULL,
  prepared_json          TEXT    NOT NULL,
  cms_sha256             TEXT,
  result_json            TEXT,
  result_sha             TEXT,
  created_by             TEXT    NOT NULL,
  created_at             INTEGER NOT NULL,
  expires_at             INTEGER NOT NULL,
  finished_at            INTEGER
);
CREATE UNIQUE INDEX idx_document_signings_pending ON document_signings(layer_id) WHERE state = 'prepared';
CREATE INDEX idx_document_signings_doc ON document_signings(doc_id, created_at);
