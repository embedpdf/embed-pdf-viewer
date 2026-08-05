-- Phase 2 auth tables (SQLite).
--
-- `revoked_jtis` — per-token denylist. JWT verification checks here
-- AFTER signature verification and BEFORE handing the request to the
-- route. Pairs with `RevokedJtisGuard` which fronts the table with an
-- in-memory LRU.
--
-- `jwks_cache` — persistent JWKS cache, keyed by issuer URL. Survives
-- restarts so we don't re-fetch on every cold boot. Refreshed lazily
-- (on `kid` miss + on TTL expiry).

CREATE TABLE revoked_jtis (
  jti        TEXT PRIMARY KEY,
  tenant_id  TEXT,
  reason     TEXT,
  revoked_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

-- Periodic GC of long-expired entries uses this index.
CREATE INDEX idx_revoked_jtis_expires_at ON revoked_jtis(expires_at);

CREATE TABLE jwks_cache (
  issuer     TEXT PRIMARY KEY,
  jwks_json  TEXT NOT NULL,
  fetched_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
