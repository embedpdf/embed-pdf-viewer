-- Security events (SQLite): the append-only history of the auth
-- control plane — every token minted through the issue endpoint and
-- every revocation, with actor and outcome.
--
-- Deliberately NOT the doc-mutation audit_log (that table backs the
-- viewers' SSE sync stream and requires doc/layer/artifact fields) and
-- NOT revoked_jtis (an enforcement denylist whose rows are GC'd once
-- tokens would have expired anyway). This table forgets nothing.
--
-- tenant_id carries NO foreign key on purpose: the security trail of a
-- deleted tenant must survive the tenant-delete cascade.

CREATE TABLE security_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  TEXT NOT NULL,
  kind       TEXT NOT NULL,
  jti        TEXT,
  doc_id     TEXT,
  scope_json TEXT NOT NULL,
  actor      TEXT NOT NULL,
  via        TEXT NOT NULL,
  reason     TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_security_events_tenant_created
  ON security_events(tenant_id, created_at DESC, id DESC);
