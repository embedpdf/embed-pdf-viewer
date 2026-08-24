-- Layer-scoped weak annotation edit presence (Postgres).
--
-- This is intentionally not a page-edit runtime lease. It does not pin
-- PDFium page handles. It records which users currently claim weak
-- annotation edit presence for batched pages in a layer namespace.

CREATE TABLE weak_annotation_sessions (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_id      TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  layer_name  TEXT NOT NULL,
  sub         TEXT NOT NULL,
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL
);

CREATE INDEX idx_weak_annotation_sessions_scope
  ON weak_annotation_sessions(tenant_id, doc_id, layer_name);

CREATE INDEX idx_weak_annotation_sessions_expiry
  ON weak_annotation_sessions(expires_at);

CREATE TABLE weak_annotation_session_pages (
  session_id         TEXT NOT NULL REFERENCES weak_annotation_sessions(id) ON DELETE CASCADE,
  page_object_number BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL,
  expires_at         BIGINT NOT NULL,
  PRIMARY KEY (session_id, page_object_number)
);

CREATE INDEX idx_weak_annotation_session_pages_page
  ON weak_annotation_session_pages(page_object_number, expires_at);
