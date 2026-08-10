-- Down for 024_upload_intent.sql (SQLite).

ALTER TABLE documents DROP COLUMN upload_expires_at;
ALTER TABLE documents DROP COLUMN upload_kind;
ALTER TABLE documents DROP COLUMN expected_size_bytes;
ALTER TABLE documents DROP COLUMN expected_sha256;
