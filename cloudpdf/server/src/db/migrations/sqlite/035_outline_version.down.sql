-- Down for 035_outline_version.sql (SQLite).
-- Plain columns, no CHECK/index, so DROP COLUMN works directly.

ALTER TABLE base_versions DROP COLUMN outline_version;
ALTER TABLE layers DROP COLUMN outline_version;
