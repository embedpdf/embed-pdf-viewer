-- Down for 049_fonts_version.sql (Postgres).

ALTER TABLE base_versions DROP COLUMN fonts_version;
ALTER TABLE layers DROP COLUMN fonts_version;
