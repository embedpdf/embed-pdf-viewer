-- Down for 045_document_names.sql (Postgres).

DROP INDEX idx_documents_tenant_size_id;
DROP INDEX idx_documents_tenant_name_key_id;
ALTER TABLE documents DROP COLUMN name_key;
ALTER TABLE documents DROP COLUMN name;
