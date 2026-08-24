-- Pin the upload intent on the pending document row.
-- See the SQLite twin for rolling-upgrade semantics.

ALTER TABLE documents ADD COLUMN expected_sha256 TEXT NULL;
ALTER TABLE documents ADD COLUMN expected_size_bytes BIGINT NULL;
ALTER TABLE documents ADD COLUMN upload_kind TEXT NULL;
ALTER TABLE documents ADD COLUMN upload_expires_at BIGINT NULL;

ALTER TABLE documents ADD CONSTRAINT documents_upload_kind_check
  CHECK (upload_kind IS NULL OR upload_kind IN ('presigned', 'proxy'));
