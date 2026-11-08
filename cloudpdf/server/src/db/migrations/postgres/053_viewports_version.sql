-- The pages' scales pin (Postgres).
--
-- `viewports_version` is the doc-level pointer the layout's cached URL
-- carries beside `layout_version` (/layout@{layoutVersion,
-- viewportsVersion}): the layout holds every page's measurement viewports.
-- It moves in the same transaction as a write that sets a page's scale, and
-- on no other write, so a scale change leaves the outline, search and
-- export caches, which pin `layout_version`, warm.

ALTER TABLE layers ADD COLUMN viewports_version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE base_versions ADD COLUMN viewports_version BIGINT NOT NULL DEFAULT 1;
