-- Tenant usage per UTC day, and modules' meters (Postgres). A counter row is
-- now one (tenant, metric, UTC day), so whoever operates the deployment can
-- add up any window, a billing period that starts mid-month included. Rows
-- written before this migration hold a whole month on its first day, so
-- months still add up. `metric` opens to modules' meters, named by the
-- module (`protected-display.views`); the server checks the names, as it
-- checks permissions. Still facts only: no limits.
--
-- `tenant_usage_once` holds the keys a meter counted once today
-- (`oncePerDay`), as sha-256 hex; the server sweeps days that are over.

ALTER TABLE tenant_usage_counter DROP CONSTRAINT tenant_usage_counter_metric_check;

ALTER TABLE tenant_usage_counter RENAME COLUMN period_start TO day;

CREATE TABLE tenant_usage_once (
  tenant_id TEXT NOT NULL,
  metric    TEXT NOT NULL,
  day       TEXT NOT NULL,
  key_hash  TEXT NOT NULL,
  PRIMARY KEY (tenant_id, metric, day, key_hash)
);

CREATE INDEX tenant_usage_once_day ON tenant_usage_once (day);
