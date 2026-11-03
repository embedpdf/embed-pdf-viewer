-- Down for 051_tenant_usage_days.sql (SQLite). Days add up into their month
-- again; modules' meters have no place in the old table and are dropped.

DROP TABLE tenant_usage_once;

CREATE TABLE tenant_usage_counter_prev (
  tenant_id    TEXT NOT NULL,
  metric       TEXT NOT NULL CHECK (metric IN ('pdf.uploads', 'pdf.views')),
  period_start TEXT NOT NULL,
  value        INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, metric, period_start)
);

INSERT INTO tenant_usage_counter_prev (tenant_id, metric, period_start, value, updated_at)
SELECT tenant_id, metric, substr(day, 1, 8) || '01', sum(value), max(updated_at)
FROM tenant_usage_counter
WHERE metric IN ('pdf.uploads', 'pdf.views')
GROUP BY tenant_id, metric, substr(day, 1, 8);

DROP TABLE tenant_usage_counter;

ALTER TABLE tenant_usage_counter_prev RENAME TO tenant_usage_counter;
