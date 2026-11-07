-- Down for 039_visitor_layer_deletion_opt_in.sql (SQLite): links that keep
-- their visitors' layers go back to the 7-day default.

CREATE TABLE share_grants_with_idle_default (
  id                         TEXT PRIMARY KEY,
  tenant_id                  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_id                     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  layer_mode                 TEXT NOT NULL DEFAULT 'shared'
                             CHECK (layer_mode IN ('shared', 'per-visitor')),
  layer_name                 TEXT,
  keep_visitor_layers        INTEGER NOT NULL DEFAULT 1,
  visitor_layer_idle_seconds INTEGER NOT NULL DEFAULT 604800,
  scope_json                 TEXT NOT NULL,
  origins_json               TEXT,
  password_hash              TEXT,
  session_ttl_seconds        INTEGER NOT NULL DEFAULT 600,
  disabled                   INTEGER NOT NULL DEFAULT 0,
  expires_at                 INTEGER,
  exchange_count             INTEGER NOT NULL DEFAULT 0,
  last_exchanged_at          INTEGER,
  created_by                 TEXT NOT NULL,
  created_at                 INTEGER NOT NULL,
  updated_at                 INTEGER NOT NULL,
  CHECK ((layer_mode = 'shared') = (layer_name IS NOT NULL))
);
INSERT INTO share_grants_with_idle_default (
  id, tenant_id, doc_id, layer_mode, layer_name, keep_visitor_layers,
  visitor_layer_idle_seconds, scope_json, origins_json, password_hash,
  session_ttl_seconds, disabled, expires_at, exchange_count, last_exchanged_at,
  created_by, created_at, updated_at
)
SELECT
  id, tenant_id, doc_id, layer_mode, layer_name, keep_visitor_layers,
  COALESCE(visitor_layer_idle_seconds, 604800), scope_json, origins_json, password_hash,
  session_ttl_seconds, disabled, expires_at, exchange_count, last_exchanged_at,
  created_by, created_at, updated_at
FROM share_grants;
DROP TABLE share_grants;
ALTER TABLE share_grants_with_idle_default RENAME TO share_grants;
CREATE INDEX idx_share_grants_tenant_created
  ON share_grants(tenant_id, created_at DESC, id DESC);
CREATE INDEX idx_share_grants_doc ON share_grants(doc_id);
