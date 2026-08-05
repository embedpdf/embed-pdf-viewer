-- Down for 012_layer_metadata_version.sql (SQLite).
-- Plain column, no CHECK/index, so DROP COLUMN works directly.

ALTER TABLE layers DROP COLUMN metadata_version;
