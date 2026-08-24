-- Keyset-pagination index for the admin documents list (SQLite).
--
-- The list reads `WHERE tenant_id = ? [AND (created_at, id) < (?, ?)]
-- ORDER BY created_at DESC, id DESC LIMIT n`. The existing
-- idx_documents_tenant_state covers the state filter but not the sort,
-- so large tenants paid a full per-tenant sort on every page. This
-- index serves the ordered scan directly; the id column doubles as the
-- tiebreaker that makes pagination stable for same-millisecond rows.

CREATE INDEX idx_documents_tenant_created_id
  ON documents(tenant_id, created_at DESC, id DESC);
