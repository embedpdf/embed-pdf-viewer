-- Tenant usage per UTC day, and modules' meters (SQLite). A counter row is
-- now one (tenant, metric, UTC day), so whoever operates the deployment can
-- add up any window, a billing period that starts mid-month included. Rows
-- written before this migration hold a whole month on its first day, so
-- months still add up. `metric` opens to modules' meters, named by the
-- module (`protected-display.views`); the server checks the names, as it
-- checks permissions. Still facts only: no limits.
--
-- `tenant_usage_once` holds the keys a meter counted once today
-- (`oncePerDay`), as sha-256 hex; the server sweeps days that are over.

CREATE TABLE tenant_usage_counter_next (
  tenant_id  TEXT NOT NULL,
  metric     TEXT NOT NULL,
  day        TEXT NOT NULL,
  value      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, metric, day)
);

INSERT INTO tenant_usage_counter_next (tenant_id, metric, day, value, updated_at)
SELECT tenant_id, metric, period_start, value, updated_at FROM tenant_usage_counter;

DROP TABLE tenant_usage_counter;

ALTER TABLE tenant_usage_counter_next RENAME TO tenant_usage_counter;

CREATE TABLE tenant_usage_once (
  tenant_id TEXT NOT NULL,
  metric    TEXT NOT NULL,
  day       TEXT NOT NULL,
  key_hash  TEXT NOT NULL,
  PRIMARY KEY (tenant_id, metric, day, key_hash)
);

CREATE INDEX tenant_usage_once_day ON tenant_usage_once (day);
