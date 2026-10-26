-- Whose layer a share link's visitors write into (SQLite).
--
-- `layer_mode` 'shared': every visitor reads and writes the link's
-- `layer_name`. 'per-visitor': each visitor gets a layer of their own,
-- `visitor-<id>`, made at their first write, so the link names no layer.
-- `keep_visitor_layers`: whether a visitor's browser keeps its layer for
-- the next visit. `visitor_layer_idle_seconds`: how long a visitor's layer
-- lives unvisited before it is deleted.
CREATE TABLE share_grants_with_layer_mode (
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
INSERT INTO share_grants_with_layer_mode (
  id, tenant_id, doc_id, layer_name, scope_json, origins_json, password_hash,
  session_ttl_seconds, disabled, expires_at, exchange_count, last_exchanged_at,
  created_by, created_at, updated_at
)
SELECT
  id, tenant_id, doc_id, layer_name, scope_json, origins_json, password_hash,
  session_ttl_seconds, disabled, expires_at, exchange_count, last_exchanged_at,
  created_by, created_at, updated_at
FROM share_grants;
DROP TABLE share_grants;
ALTER TABLE share_grants_with_layer_mode RENAME TO share_grants;
CREATE INDEX idx_share_grants_tenant_created
  ON share_grants(tenant_id, created_at DESC, id DESC);
CREATE INDEX idx_share_grants_doc ON share_grants(doc_id);

-- A visitor's layer, from its first write: the link that made it, the
-- visitor, and when they last opened it (the idle clock).
ALTER TABLE layers ADD COLUMN grant_id TEXT;
ALTER TABLE layers ADD COLUMN visitor_id TEXT;
ALTER TABLE layers ADD COLUMN last_seen_at INTEGER;
CREATE INDEX idx_layers_grant ON layers(grant_id, last_seen_at);
