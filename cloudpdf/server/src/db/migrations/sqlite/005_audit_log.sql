-- Phase 5 audit log (SQLite).
--
-- The database row is the operational audit index: it is inserted in
-- the same transaction that advances layer/page versions. Object
-- storage receives a JSONL mirror after commit for cheap long-term
-- archival.

CREATE TABLE audit_log (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_id             TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  layer_id           TEXT NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  layer_name         TEXT NOT NULL,
  ts                 INTEGER NOT NULL,
  sub                TEXT NOT NULL,
  kind               TEXT NOT NULL,
  page_object_number INTEGER,
  affected_pages_json TEXT NOT NULL,
  artifact_version   INTEGER NOT NULL,
  artifact_key       TEXT NOT NULL,
  artifact_sha       TEXT NOT NULL,
  artifact_size      INTEGER NOT NULL,
  idempotency_key    TEXT,
  payload_json       TEXT NOT NULL
);

CREATE INDEX idx_audit_log_doc_ts
  ON audit_log(doc_id, ts);

CREATE INDEX idx_audit_log_tenant_ts
  ON audit_log(tenant_id, ts);

CREATE UNIQUE INDEX idx_audit_log_idem
  ON audit_log(layer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
