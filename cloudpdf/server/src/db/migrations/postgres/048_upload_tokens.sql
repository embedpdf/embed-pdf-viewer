-- Upload tokens (Postgres): a browser uploads with a token its customer's
-- server made. Each document the token starts records the token's jti,
-- which commit and the proxied transfer check (NULL for everything
-- else), and `upload_token_uses` counts the documents each token has
-- started: init takes one atomically, so no token starts more than its
-- max_files, however many inits race.
ALTER TABLE documents ADD COLUMN upload_token_jti TEXT;
CREATE INDEX idx_documents_upload_token ON documents(upload_token_jti)
  WHERE upload_token_jti IS NOT NULL;

CREATE TABLE upload_token_uses (
  jti TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  files INTEGER NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX idx_upload_token_uses_tenant ON upload_token_uses(tenant_id);
