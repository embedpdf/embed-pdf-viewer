-- The outline's read family (SQLite).
--
-- `outline_version` is the doc-level pointer for the immutable outline
-- (/outline@{layoutVersion, outlineVersion}). Outline writes move it and no
-- other pointer; the outline URL also pins the layout, since the outline is
-- read in page space.

ALTER TABLE layers ADD COLUMN outline_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE base_versions ADD COLUMN outline_version INTEGER NOT NULL DEFAULT 1;
