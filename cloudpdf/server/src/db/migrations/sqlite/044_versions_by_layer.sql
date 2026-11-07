-- A signature's base version belongs to the layer it was made in (SQLite).
--
-- A signature writes a new base version and moves only the signing layer's
-- `base_sha`; `documents.base_sha` is the upload, where every new layer
-- starts. `layer_id` names the layer a version was made in (NULL for the
-- upload), and a layer's versions are numbered along its own chain. SQLite
-- keeps the old document-wide `UNIQUE (doc_id, number)` inline, so the
-- table is rebuilt.
CREATE TABLE base_versions_by_layer (
  tenant_id           TEXT    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_id              TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  layer_id            TEXT    REFERENCES layers(id) ON DELETE CASCADE,
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
  PRIMARY KEY (doc_id, sha256)
);

-- A signed version belongs to its signing's layer.
INSERT INTO base_versions_by_layer
  (tenant_id, doc_id, layer_id, sha256, byte_length, number, parent_sha256, producer_kind,
   producer_ref, storage_key, layout_version, metadata_version, attachments_version,
   annotations_version, forms_version, outline_version, created_at)
SELECT v.tenant_id, v.doc_id,
       CASE WHEN v.producer_kind = 'signature'
            THEN (SELECT s.layer_id FROM document_signings s WHERE s.id = v.producer_ref)
       END,
       v.sha256, v.byte_length, v.number, v.parent_sha256, v.producer_kind, v.producer_ref,
       v.storage_key, v.layout_version, v.metadata_version, v.attachments_version,
       v.annotations_version, v.forms_version, v.outline_version, v.created_at
FROM base_versions v;

DROP TABLE base_versions;
ALTER TABLE base_versions_by_layer RENAME TO base_versions;
CREATE UNIQUE INDEX idx_base_versions_upload ON base_versions(doc_id)
  WHERE producer_kind = 'upload';
CREATE UNIQUE INDEX idx_base_versions_layer_number ON base_versions(layer_id, number)
  WHERE layer_id IS NOT NULL;

-- Documents a signature moved go back to their upload. Their page rows were
-- the signing layer's, so they go too: the next open reads them from the
-- upload again. `doc_version` only moves forward (its URLs are immutable).
DELETE FROM document_pages WHERE doc_id IN (
  SELECT d.id FROM documents d
  JOIN base_versions v ON v.doc_id = d.id AND v.producer_kind = 'upload'
  WHERE v.sha256 <> d.base_sha
);
UPDATE documents SET
  base_sha = (SELECT v.sha256 FROM base_versions v
              WHERE v.doc_id = documents.id AND v.producer_kind = 'upload'),
  storage_size_bytes = (SELECT v.byte_length FROM base_versions v
                        WHERE v.doc_id = documents.id AND v.producer_kind = 'upload'),
  doc_version = doc_version + 1
WHERE EXISTS (SELECT 1 FROM base_versions v
              WHERE v.doc_id = documents.id AND v.producer_kind = 'upload'
                AND v.sha256 <> documents.base_sha);

-- A live layer on another layer's version, which it was started on after
-- that signature moved the document: with nothing stored of its own, it
-- starts over on the upload. One with changes keeps its version (deleting a
-- layer keeps a version another layer is on); list them with
--   SELECT l.id, l.doc_id, l.name FROM layers l JOIN base_versions v
--   ON v.doc_id = l.doc_id AND v.sha256 = l.base_sha
--   WHERE l.deleted_at IS NULL AND v.producer_kind = 'signature'
--     AND (v.layer_id IS NULL OR v.layer_id <> l.id);
UPDATE layers SET
  base_sha = (SELECT v.sha256 FROM base_versions v
              WHERE v.doc_id = layers.doc_id AND v.producer_kind = 'upload'),
  doc_version = doc_version + 1
WHERE deleted_at IS NULL AND current_artifact_key IS NULL
  AND EXISTS (SELECT 1 FROM base_versions v
              WHERE v.doc_id = layers.doc_id AND v.sha256 = layers.base_sha
                AND v.producer_kind = 'signature'
                AND (v.layer_id IS NULL OR v.layer_id <> layers.id));

-- A signed version whose layer is gone (its signing went with it), and that
-- no live layer is on: nothing reads it any more.
DELETE FROM base_versions
WHERE producer_kind = 'signature' AND layer_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM layers l
                  WHERE l.doc_id = base_versions.doc_id AND l.base_sha = base_versions.sha256
                    AND l.deleted_at IS NULL);
