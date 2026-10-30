-- Down for 048_upload_tokens.sql (SQLite).
DROP INDEX idx_upload_token_uses_tenant;
DROP TABLE upload_token_uses;
DROP INDEX idx_documents_upload_token;
ALTER TABLE documents DROP COLUMN upload_token_jti;
