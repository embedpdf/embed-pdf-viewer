-- Down for 030_signatures.sql (postgres).

DROP INDEX IF EXISTS idx_document_signings_doc;
DROP INDEX IF EXISTS idx_document_signings_pending;
DROP TABLE IF EXISTS document_signings;
ALTER TABLE layers DROP COLUMN base_sha;
DROP TABLE IF EXISTS base_versions;
