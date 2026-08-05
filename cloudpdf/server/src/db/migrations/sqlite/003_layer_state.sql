-- Phase 6 durable manifest/revision authority (SQLite).
--
-- CDN cache versions and weak-ref annotation revisions are deliberately
-- separate counters:
--   * *_version columns select immutable URL bytes.
--   * annotation_generation validates index-based annotation refs.

ALTER TABLE documents ADD COLUMN doc_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE document_pages (
  doc_id                TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_object_number    INTEGER NOT NULL,
  page_index            INTEGER NOT NULL,
  content_version       INTEGER NOT NULL DEFAULT 1,
  annotation_version    INTEGER NOT NULL DEFAULT 1,
  annotation_generation INTEGER NOT NULL DEFAULT 0,
  has_weak_annotations  INTEGER NOT NULL DEFAULT 0 CHECK (has_weak_annotations IN (0, 1)),
  updated_at            INTEGER NOT NULL,
  PRIMARY KEY (doc_id, page_object_number)
);

CREATE UNIQUE INDEX uq_document_pages_doc_index
  ON document_pages(doc_id, page_index);

CREATE TABLE layers (
  id                    TEXT PRIMARY KEY,
  doc_id                TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  doc_version           INTEGER NOT NULL DEFAULT 1,
  current_version       INTEGER NOT NULL DEFAULT 0,
  current_artifact_key  TEXT,
  current_artifact_sha  TEXT,
  current_artifact_size INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  UNIQUE (doc_id, name)
);

CREATE INDEX idx_layers_doc ON layers(doc_id);

CREATE TABLE layer_pages (
  layer_id              TEXT NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  page_object_number    INTEGER NOT NULL,
  page_index            INTEGER NOT NULL,
  content_version       INTEGER NOT NULL DEFAULT 1,
  annotation_version    INTEGER NOT NULL DEFAULT 1,
  annotation_generation INTEGER NOT NULL DEFAULT 0,
  has_weak_annotations  INTEGER NOT NULL DEFAULT 0 CHECK (has_weak_annotations IN (0, 1)),
  updated_at            INTEGER NOT NULL,
  PRIMARY KEY (layer_id, page_object_number)
);

CREATE UNIQUE INDEX uq_layer_pages_layer_index
  ON layer_pages(layer_id, page_index);
