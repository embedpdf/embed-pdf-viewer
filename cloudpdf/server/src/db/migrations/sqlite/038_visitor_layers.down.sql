-- Down for 038_visitor_layers.sql (SQLite). Per-visitor links go: they
-- name no layer.

DROP INDEX IF EXISTS idx_layers_grant;
ALTER TABLE layers DROP COLUMN last_seen_at;
ALTER TABLE layers DROP COLUMN visitor_id;
ALTER TABLE layers DROP COLUMN grant_id;

CREATE TABLE share_grants_without_layer_mode (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_id              TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  layer_name          TEXT NOT NULL DEFAULT 'default',
  scope_json          TEXT NOT NULL,
  origins_json        TEXT,
  password_hash       TEXT,
  session_ttl_seconds INTEGER NOT NULL DEFAULT 600,
  disabled            INTEGER NOT NULL DEFAULT 0,
  expires_at          INTEGER,
  exchange_count      INTEGER NOT NULL DEFAULT 0,
  last_exchanged_at   INTEGER,
  created_by          TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
INSERT INTO share_grants_without_layer_mode (
  id, tenant_id, doc_id, layer_name, scope_json, origins_json, password_hash,
  session_ttl_seconds, disabled, expires_at, exchange_count, last_exchanged_at,
  created_by, created_at, updated_at
)
SELECT
  id, tenant_id, doc_id, layer_name, scope_json, origins_json, password_hash,
  session_ttl_seconds, disabled, expires_at, exchange_count, last_exchanged_at,
  created_by, created_at, updated_at
FROM share_grants WHERE layer_mode = 'shared';
DROP TABLE share_grants;
ALTER TABLE share_grants_without_layer_mode RENAME TO share_grants;
CREATE INDEX idx_share_grants_tenant_created
  ON share_grants(tenant_id, created_at DESC, id DESC);
CREATE INDEX idx_share_grants_doc ON share_grants(doc_id);
