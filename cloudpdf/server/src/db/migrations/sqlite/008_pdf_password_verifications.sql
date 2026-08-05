CREATE TABLE IF NOT EXISTS pdf_password_verifications (
  tenant_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  security_fingerprint TEXT NOT NULL,
  password_proof TEXT NOT NULL,
  hmac_key_id TEXT NOT NULL,
  opened_as TEXT NOT NULL CHECK (opened_as IN ('none','user','owner')),
  pdf_permissions_bits INTEGER NOT NULL,
  pdf_permissions_all_allowed INTEGER NOT NULL,
  security_handler_revision INTEGER,
  verified_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, doc_id, base_sha, security_fingerprint, password_proof)
);

CREATE INDEX IF NOT EXISTS idx_pdf_password_verifications_expires
  ON pdf_password_verifications (expires_at);
