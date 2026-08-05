-- Down for 015_document_thumbnail.sql (Postgres).

ALTER TABLE documents DROP COLUMN thumbnail_state;
ALTER TABLE documents DROP COLUMN thumbnail_key;
