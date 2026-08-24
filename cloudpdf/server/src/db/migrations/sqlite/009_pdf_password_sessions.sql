CREATE TABLE IF NOT EXISTS pdf_password_sessions (
  tenant_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  layer_name TEXT NOT NULL,
  sub TEXT NOT NULL,
  jwt_jti TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  security_fingerprint TEXT NOT NULL,
  opened_as TEXT NOT NULL CHECK (opened_as IN ('none','user','owner')),
  pdf_permissions_bits INTEGER NOT NULL,
  pdf_permissions_all_allowed INTEGER NOT NULL,
  security_handler_revision INTEGER,
  active_expires_at INTEGER NOT NULL,
  renewable_until INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  server_secret_id TEXT NOT NULL,
  kms_provider_id TEXT NOT NULL,
  kms_key_id TEXT NOT NULL,
  crypto_version TEXT NOT NULL,
  wrapped_data_key BLOB NOT NULL,
  row_salt BLOB NOT NULL,
  nonce BLOB NOT NULL,
  ciphertext BLOB NOT NULL,
  auth_tag BLOB NOT NULL,
  PRIMARY KEY (
    tenant_id,
    doc_id,
    layer_name,
    sub,
    jwt_jti,
    base_sha,
    security_fingerprint
  )
);

CREATE INDEX IF NOT EXISTS idx_pdf_password_sessions_active
  ON pdf_password_sessions (tenant_id, doc_id, layer_name, sub, jwt_jti, active_expires_at);

CREATE INDEX IF NOT EXISTS idx_pdf_password_sessions_renewable
  ON pdf_password_sessions (renewable_until);
