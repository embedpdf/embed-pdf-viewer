-- Pin the upload intent on the pending document row.
--
-- Existing rows remain nullable so rolling upgrades can finish or sweep
-- uploads created by an older server. Every newly initialized upload writes
-- all four fields before any bytes are accepted.

ALTER TABLE documents ADD COLUMN expected_sha256 TEXT NULL;
ALTER TABLE documents ADD COLUMN expected_size_bytes INTEGER NULL;
ALTER TABLE documents ADD COLUMN upload_kind TEXT NULL;
ALTER TABLE documents ADD COLUMN upload_expires_at INTEGER NULL;
