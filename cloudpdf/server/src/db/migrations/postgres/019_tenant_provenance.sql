-- Tenant provenance + list ordering (Postgres).
--
-- `auto_provisioned` distinguishes namespaces that materialized on
-- first use (CLOUDPDF_AUTO_PROVISION_TENANT) from explicitly created
-- ones, so `tenants.list` can audit ghosts instead of hiding them.
-- The index serves the keyset-paginated tenant list the same way
-- idx_documents_tenant_created_id serves the documents list.

ALTER TABLE tenants ADD COLUMN auto_provisioned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_tenants_created_id ON tenants(created_at DESC, id DESC);
