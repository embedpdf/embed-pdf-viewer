-- Down for 046_folders.sql (Postgres).

DROP INDEX idx_documents_folder_tenant_size_id;
DROP INDEX idx_documents_folder_tenant_name_key_id;
DROP INDEX idx_documents_folder_tenant_created_id;
ALTER TABLE documents DROP COLUMN folder_id;
DROP TABLE folders;
