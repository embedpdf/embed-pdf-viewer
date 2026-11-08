-- Down for 053_viewports_version.sql (SQLite).
-- Plain columns, no CHECK/index, so DROP COLUMN works directly.

ALTER TABLE base_versions DROP COLUMN viewports_version;
ALTER TABLE layers DROP COLUMN viewports_version;
