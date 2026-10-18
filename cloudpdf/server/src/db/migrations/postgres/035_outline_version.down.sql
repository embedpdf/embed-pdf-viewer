-- Down for 035_outline_version.sql (Postgres).

ALTER TABLE base_versions DROP COLUMN outline_version;
ALTER TABLE layers DROP COLUMN outline_version;
