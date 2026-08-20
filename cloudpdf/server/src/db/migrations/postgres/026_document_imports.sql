-- Import provenance + (phase 3b) job queue for documents.import.
-- One row per document (unique doc_id): synchronous imports upsert
-- attempt records (running -> succeeded | failed) answering "who
-- pulled what, from which connection, as whom, with what outcome" —
-- structured audit that does NOT belong in security_events (that
-- table is the auth-control-plane trail). The async worker (phase 3b)
-- will additionally use queued/running with lease fencing; those
-- columns exist now so 3b activates on this shape instead of
-- reshaping it.
CREATE TABLE document_imports (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  doc_id              TEXT NOT NULL,
  source_kind         TEXT NOT NULL,
  connection_id       TEXT NULL,
  source_location     TEXT NOT NULL,
  requested_revision  TEXT NULL,
  resolved_revision   TEXT NULL,
  expected_sha256     TEXT NULL,
  expected_size_bytes BIGINT NULL,
  state               TEXT NOT NULL CHECK (state IN ('queued', 'running', 'succeeded', 'failed')),
  attempts            BIGINT NOT NULL DEFAULT 0,
  max_attempts        BIGINT NOT NULL DEFAULT 5,
  next_attempt_at     BIGINT NOT NULL,
  lease_owner         TEXT NULL,
  lease_token         TEXT NULL,
  lease_expires_at    BIGINT NULL,
  last_error          TEXT NULL,
  requested_by        TEXT NULL,
  via                 TEXT NULL,
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL
);

CREATE UNIQUE INDEX ux_document_imports_doc ON document_imports (doc_id);
CREATE INDEX ix_document_imports_claim ON document_imports (state, next_attempt_at);
CREATE INDEX ix_document_imports_tenant ON document_imports (tenant_id, created_at);
