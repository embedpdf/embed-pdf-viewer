-- Durable bookkeeping for batch audit JSONL exports.
--
-- `audit_log` is the transactional source of truth. This table coordinates
-- external schedulers / CronJobs so multiple server instances do not export
-- the same closed-day archive at the same time.

CREATE TABLE audit_exports (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id        TEXT NOT NULL,
  doc_id           TEXT NOT NULL,
  day              TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  storage_key      TEXT,
  event_count      INTEGER NOT NULL DEFAULT 0,
  checksum         TEXT,
  lease_id         TEXT,
  lease_expires_at INTEGER,
  started_at       INTEGER NOT NULL,
  finished_at      INTEGER,
  error_json       TEXT,
  updated_at       INTEGER NOT NULL,
  UNIQUE (tenant_id, doc_id, day)
);

CREATE INDEX idx_audit_exports_day_status
  ON audit_exports(day, status);

