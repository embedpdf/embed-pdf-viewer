-- Per-tenant usage counters (SQLite): FACTS, one row per
-- (tenant, metric, UTC month). Deliberately separate from
-- license_usage_counter — that table answers "is this deployment
-- within its license" and stays deployment-wide; this one answers
-- "what did each tenant consume" for whoever operates the deployment.
-- No limit columns: the engine records and reports, it holds no
-- opinion. storage.bytes is computed live from documents, not counted.

CREATE TABLE tenant_usage_counter (
  tenant_id    TEXT NOT NULL,
  metric       TEXT NOT NULL CHECK (metric IN ('pdf.uploads', 'pdf.views')),
  period_start TEXT NOT NULL,
  value        INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, metric, period_start)
);
