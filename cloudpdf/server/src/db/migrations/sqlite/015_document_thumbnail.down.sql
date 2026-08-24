-- Down for 015_document_thumbnail.sql (SQLite).
-- Plain columns, no CHECK/index, so DROP COLUMN works directly.

ALTER TABLE documents DROP COLUMN thumbnail_state;
ALTER TABLE documents DROP COLUMN thumbnail_key;
