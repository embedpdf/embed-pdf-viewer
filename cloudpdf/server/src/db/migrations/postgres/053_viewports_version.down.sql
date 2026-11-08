-- Down for 053_viewports_version.sql (Postgres).

ALTER TABLE base_versions DROP COLUMN viewports_version;
ALTER TABLE layers DROP COLUMN viewports_version;
