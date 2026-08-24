-- Down for 024_upload_intent.sql (Postgres).

ALTER TABLE documents DROP CONSTRAINT documents_upload_kind_check;
ALTER TABLE documents DROP COLUMN upload_expires_at;
ALTER TABLE documents DROP COLUMN upload_kind;
ALTER TABLE documents DROP COLUMN expected_size_bytes;
ALTER TABLE documents DROP COLUMN expected_sha256;
