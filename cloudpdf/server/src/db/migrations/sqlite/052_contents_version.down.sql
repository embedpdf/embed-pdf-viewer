-- Down for 052_contents_version.sql (SQLite).
-- Plain columns, no CHECK/index, so DROP COLUMN works directly.

ALTER TABLE base_versions DROP COLUMN contents_version;
ALTER TABLE layers DROP COLUMN contents_version;
