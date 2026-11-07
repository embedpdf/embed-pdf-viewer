-- Folders (SQLite).
--
-- A folder stores only its parent (NULL = the top level); the tree is
-- walked with recursive queries. A document stores only the folder it is
-- in (NULL = the top level), never a path, so moving a folder never
-- touches the documents inside it.
--
-- Folder names are unique among siblings, compared through `name_key`
-- (NFC, lowercased by the server, as for documents). Folder ids are
-- global, so `(parent_id, name_key)` suffices; a unique index treats NULL
-- parents as all different, so top-level folders get their own index.
-- The sibling index also serves walking a folder's children and the
-- self-referencing foreign key.
--
-- The foreign keys keep every document and folder pointing at a folder
-- that exists, including when an upload races a folder delete. The
-- document indexes serve each list sort inside one folder, the way the
-- workspace-wide indexes serve it across folders; they lead with
-- `folder_id` so deleting a folder finds its documents by index.

CREATE TABLE folders (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES folders(id),
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
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
  ON documents(folder_id, tenant_id, COALESCE(storage_size_bytes, 0), id);
