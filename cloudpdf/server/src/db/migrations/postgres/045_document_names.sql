-- Document names (Postgres). See the SQLite twin for the column semantics.

ALTER TABLE documents ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN name_key TEXT COLLATE "C" NOT NULL DEFAULT '';

UPDATE documents
   SET name = CASE
         WHEN jsonb_typeof(metadata_json::jsonb -> 'name') = 'string'
              AND metadata_json::jsonb ->> 'name' <> ''
         THEN metadata_json::jsonb ->> 'name'
         ELSE id
       END;
UPDATE documents SET name_key = lower(name);

CREATE INDEX idx_documents_tenant_name_key_id
  ON documents(tenant_id, name_key, id);
CREATE INDEX idx_documents_tenant_size_id
  ON documents(tenant_id, (COALESCE(storage_size_bytes, 0)), id);
