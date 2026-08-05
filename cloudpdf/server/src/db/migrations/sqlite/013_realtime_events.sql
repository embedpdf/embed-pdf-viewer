-- Realtime event channel plumbing (SQLite).
--
-- `audit_log.origin_session_id`: the engine-instance session id sent by the
-- mutating client (X-Engine-Session-Id). Lets an SSE subscriber drop its OWN
-- echoes — its local publish already covered them — so every mutation appears
-- in every stream exactly once. NULL for callers that don't send the header.
--
-- `layers.last_audit_id`: the audit-log head at this layer's current state,
-- advanced in the SAME transaction as every audit append. The manifest
-- publishes it as `auditHead`, giving a fresh subscriber a GAPLESS cursor:
-- subscribe-from-manifest can never miss rows between manifest fetch and
-- stream open.

ALTER TABLE audit_log ADD COLUMN origin_session_id TEXT NULL;
ALTER TABLE layers ADD COLUMN last_audit_id INTEGER NOT NULL DEFAULT 0;
