-- Document names (SQLite).
--
-- `name` is what people call the document; the server always writes it
-- (the id when the caller names nothing), and the empty default only
-- fills rows inserted around the documents repo. `name_key` is the form that
-- search and the name sort compare: NFC and lowercased by the server, so
-- both dialects fold case the same way, then compared byte by byte
-- (SQLite's BINARY collation, Postgres `COLLATE "C"`).
--
-- Existing rows take their name from `metadata.name` when it is a
-- non-empty string, else the id. Their key is folded here with `lower()`,
-- which in SQLite folds ASCII letters only.
--
-- The two indexes serve the name and size sorts the way
-- idx_documents_tenant_created_id serves the default newest-first list;
-- `id` is the tiebreaker that keeps keyset pagination stable.

ALTER TABLE documents ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN name_key TEXT NOT NULL DEFAULT '';

UPDATE documents
   SET name = CASE
         WHEN json_type(metadata_json, '$.name') = 'text'
              AND json_extract(metadata_json, '$.name') <> ''
         THEN json_extract(metadata_json, '$.name')
         ELSE id
       END;
UPDATE documents SET name_key = lower(name);

CREATE INDEX idx_documents_tenant_name_key_id
  ON documents(tenant_id, name_key, id);
CREATE INDEX idx_documents_tenant_size_id
  ON documents(tenant_id, COALESCE(storage_size_bytes, 0), id);
