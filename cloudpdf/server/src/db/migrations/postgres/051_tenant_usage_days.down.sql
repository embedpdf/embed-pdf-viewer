-- Down for 051_tenant_usage_days.sql (Postgres). Days add up into their month
-- again; modules' meters have no place in the old table and are dropped.

DROP TABLE tenant_usage_once;

DELETE FROM tenant_usage_counter WHERE metric NOT IN ('pdf.uploads', 'pdf.views');

CREATE TABLE tenant_usage_counter_prev AS
SELECT tenant_id, metric, substr(day, 1, 8) || '01' AS day, sum(value) AS value,
       max(updated_at) AS updated_at
FROM tenant_usage_counter
GROUP BY tenant_id, metric, substr(day, 1, 8);

DELETE FROM tenant_usage_counter;

INSERT INTO tenant_usage_counter (tenant_id, metric, day, value, updated_at)
SELECT tenant_id, metric, day, value, updated_at FROM tenant_usage_counter_prev;

DROP TABLE tenant_usage_counter_prev;

ALTER TABLE tenant_usage_counter RENAME COLUMN day TO period_start;

ALTER TABLE tenant_usage_counter ADD CONSTRAINT tenant_usage_counter_metric_check
  CHECK (metric IN ('pdf.uploads', 'pdf.views'));
