-- Down for 031_drop_weak_annotation_state.sql (SQLite).
--
-- Re-creates the columns and the session tables from 003 and 004. Their
-- values are not recoverable (structure-only rollback), which is harmless
-- pre-launch.

ALTER TABLE document_pages ADD COLUMN annotation_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE document_pages ADD COLUMN has_weak_annotations  INTEGER NOT NULL DEFAULT 0 CHECK (has_weak_annotations IN (0, 1));

ALTER TABLE layer_pages ADD COLUMN annotation_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE layer_pages ADD COLUMN has_weak_annotations  INTEGER NOT NULL DEFAULT 0 CHECK (has_weak_annotations IN (0, 1));

CREATE TABLE weak_annotation_sessions (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_id      TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  layer_name  TEXT NOT NULL,
  sub         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX idx_weak_annotation_sessions_scope
  ON weak_annotation_sessions(tenant_id, doc_id, layer_name);

CREATE INDEX idx_weak_annotation_sessions_expiry
  ON weak_annotation_sessions(expires_at);

CREATE TABLE weak_annotation_session_pages (
  session_id         TEXT NOT NULL REFERENCES weak_annotation_sessions(id) ON DELETE CASCADE,
  page_object_number INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  expires_at         INTEGER NOT NULL,
  PRIMARY KEY (session_id, page_object_number)
);

CREATE INDEX idx_weak_annotation_session_pages_page
  ON weak_annotation_session_pages(page_object_number, expires_at);
