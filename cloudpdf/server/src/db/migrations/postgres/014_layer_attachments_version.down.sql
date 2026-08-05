-- Down for 014_layer_attachments_version.sql (Postgres).
-- Plain column, no CHECK/index, so DROP COLUMN works directly.

ALTER TABLE layers DROP COLUMN attachments_version;
