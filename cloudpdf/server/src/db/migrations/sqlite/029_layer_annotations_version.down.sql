-- Down for 029_layer_annotations_version.sql (SQLite).
-- Plain column, no CHECK/index, so DROP COLUMN works directly.

ALTER TABLE layers DROP COLUMN annotations_version;
