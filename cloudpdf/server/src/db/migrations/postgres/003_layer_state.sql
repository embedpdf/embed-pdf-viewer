-- Phase 6 durable manifest/revision authority (Postgres).
--
-- CDN cache versions and weak-ref annotation revisions are deliberately
-- separate counters:
--   * *_version columns select immutable URL bytes.
--   * annotation_generation validates index-based annotation refs.

ALTER TABLE documents ADD COLUMN doc_version BIGINT NOT NULL DEFAULT 1;

CREATE TABLE document_pages (
  doc_id                TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_object_number    BIGINT NOT NULL,
  page_index            BIGINT NOT NULL,
  content_version       BIGINT NOT NULL DEFAULT 1,
  annotation_version    BIGINT NOT NULL DEFAULT 1,
  annotation_generation BIGINT NOT NULL DEFAULT 0,
  has_weak_annotations  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            BIGINT NOT NULL,
  PRIMARY KEY (doc_id, page_object_number)
);

CREATE UNIQUE INDEX uq_document_pages_doc_index
  ON document_pages(doc_id, page_index);

CREATE TABLE layers (
  id                    TEXT PRIMARY KEY,
  doc_id                TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  doc_version           BIGINT NOT NULL DEFAULT 1,
  current_version       BIGINT NOT NULL DEFAULT 0,
  current_artifact_key  TEXT,
  current_artifact_sha  TEXT,
  current_artifact_size BIGINT,
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL,
  UNIQUE (doc_id, name)
);

CREATE INDEX idx_layers_doc ON layers(doc_id);

CREATE TABLE layer_pages (
  layer_id              TEXT NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  page_object_number    BIGINT NOT NULL,
  page_index            BIGINT NOT NULL,
  content_version       BIGINT NOT NULL DEFAULT 1,
  annotation_version    BIGINT NOT NULL DEFAULT 1,
  annotation_generation BIGINT NOT NULL DEFAULT 0,
  has_weak_annotations  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            BIGINT NOT NULL,
  PRIMARY KEY (layer_id, page_object_number)
);

CREATE UNIQUE INDEX uq_layer_pages_layer_index
  ON layer_pages(layer_id, page_index);
