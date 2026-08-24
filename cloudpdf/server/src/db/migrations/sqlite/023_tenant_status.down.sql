-- Down for 023_tenant_status.sql (SQLite).

ALTER TABLE tenants DROP COLUMN suspended_at;
ALTER TABLE tenants DROP COLUMN status;
