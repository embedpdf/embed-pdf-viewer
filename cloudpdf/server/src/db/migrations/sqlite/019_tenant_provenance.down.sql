-- Down for 019_tenant_provenance.sql (SQLite).
-- Plain column + index, no data movement.

DROP INDEX idx_tenants_created_id;
ALTER TABLE tenants DROP COLUMN auto_provisioned;
