-- Phase 2 auth tables (Postgres). Mirror of the SQLite variant; same
-- logical schema, same column names, same column types modulo BIGINT
-- normalisation (epoch-ms in both dialects via the BIGINT type parser
-- in db/drivers/postgres.ts).

CREATE TABLE revoked_jtis (
  jti        TEXT PRIMARY KEY,
  tenant_id  TEXT,
  reason     TEXT,
  revoked_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX idx_revoked_jtis_expires_at ON revoked_jtis(expires_at);

CREATE TABLE jwks_cache (
  issuer     TEXT PRIMARY KEY,
  jwks_json  TEXT NOT NULL,
  fetched_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
