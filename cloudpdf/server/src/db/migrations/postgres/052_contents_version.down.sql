-- Down for 052_contents_version.sql (Postgres).

ALTER TABLE base_versions DROP COLUMN contents_version;
ALTER TABLE layers DROP COLUMN contents_version;
