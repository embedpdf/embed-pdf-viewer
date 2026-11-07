-- Down for 049_fonts_version.sql (SQLite).
-- Plain columns, no CHECK/index, so DROP COLUMN works directly.

ALTER TABLE base_versions DROP COLUMN fonts_version;
ALTER TABLE layers DROP COLUMN fonts_version;
