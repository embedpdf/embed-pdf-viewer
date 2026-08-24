-- Down for 023_tenant_status.sql (Postgres).

ALTER TABLE tenants DROP COLUMN suspended_at;
ALTER TABLE tenants DROP COLUMN status;
