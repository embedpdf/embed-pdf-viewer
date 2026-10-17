-- Down for 034_forms_version.sql (Postgres).
-- Plain columns, no CHECK/index, so DROP COLUMN works directly.

ALTER TABLE layer_pages DROP COLUMN widget_version;
ALTER TABLE document_pages DROP COLUMN widget_version;
ALTER TABLE base_versions DROP COLUMN forms_version;
ALTER TABLE layers DROP COLUMN forms_version;
