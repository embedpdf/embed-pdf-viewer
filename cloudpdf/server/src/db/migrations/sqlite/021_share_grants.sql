-- Share grants (SQLite): standing, revocable authorization decisions
-- for the no-backend embed flow. The row id IS the public share token —
-- it is a REFERENCE whose power is evaluated at exchange time, never a
-- bearer credential, which is what lets it live in public HTML while
-- staying editable and revocable. Exchange mints an ordinary
-- short-lived doc JWT carrying the grant's scope and origin lock.
--
-- The passphrase column stores an scrypt envelope, never the phrase:
-- share tokens are machine randomness and safe to show again in a
-- dashboard, but a passphrase is human-chosen and gets password
-- discipline.

CREATE TABLE share_grants (
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

CREATE INDEX idx_share_grants_tenant_created
  ON share_grants(tenant_id, created_at DESC, id DESC);
CREATE INDEX idx_share_grants_doc ON share_grants(doc_id);
