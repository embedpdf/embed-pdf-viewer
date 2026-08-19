-- Async imports (phase 3b): the job must be re-drivable after a crash,
-- so the queued row carries the full sanitized wire descriptor
-- (connection sources only — presigned URLs are secrets and expire,
-- which is why async rejects them). Sync provenance rows leave it NULL.
ALTER TABLE document_imports ADD COLUMN source_json TEXT NULL;
