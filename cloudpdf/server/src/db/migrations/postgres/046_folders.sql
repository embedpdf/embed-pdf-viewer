-- Folders (Postgres). See the SQLite twin for the model.

CREATE TABLE folders (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES folders(id),
  name        TEXT NOT NULL,
  name_key    TEXT COLLATE "C" NOT NULL,
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL,
  created_by  TEXT
);

CREATE UNIQUE INDEX uq_folders_sibling_name
  ON folders(parent_id, name_key)
  WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX uq_folders_top_name
  ON folders(tenant_id, name_key)
  WHERE parent_id IS NULL;
CREATE INDEX idx_folders_tenant_name_key_id
  ON folders(tenant_id, name_key, id);

ALTER TABLE documents ADD COLUMN folder_id TEXT REFERENCES folders(id);

CREATE INDEX idx_documents_folder_tenant_created_id
  ON documents(folder_id, tenant_id, created_at DESC, id DESC);
CREATE INDEX idx_documents_folder_tenant_name_key_id
  ON documents(folder_id, tenant_id, name_key, id);
CREATE INDEX idx_documents_folder_tenant_size_id
  ON documents(folder_id, tenant_id, (COALESCE(storage_size_bytes, 0)), id);
