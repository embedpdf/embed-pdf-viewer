-- Down for 007_document_security.sql (Postgres).
--
-- Postgres drops CHECK-constrained columns directly (no table rebuild
-- needed, unlike SQLite). Reverse declaration order.

ALTER TABLE documents DROP COLUMN security_probed_at;
ALTER TABLE documents DROP COLUMN pdf_opened_as;
ALTER TABLE documents DROP COLUMN pdf_permissions_all_allowed;
ALTER TABLE documents DROP COLUMN pdf_permissions_bits;
ALTER TABLE documents DROP COLUMN security_handler_revision;
ALTER TABLE documents DROP COLUMN encryption_requires_password;
ALTER TABLE documents DROP COLUMN encryption_state;
