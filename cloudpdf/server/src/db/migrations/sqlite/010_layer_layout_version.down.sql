-- Down for 010_layer_layout_version.sql (SQLite).
-- Plain column, no CHECK/index, so DROP COLUMN works directly.

ALTER TABLE layers DROP COLUMN layout_version;
