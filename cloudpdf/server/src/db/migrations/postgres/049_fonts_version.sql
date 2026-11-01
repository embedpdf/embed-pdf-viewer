-- The fonts' read family (Postgres).
--
-- `fonts_version` is the doc-level pointer for the immutable font list
-- (/fonts@{fontsVersion, serverFonts}). A write that changes the fonts the
-- list shows (one that embeds a font, or removes the last use of one) moves
-- it; the list's URL also carries the server's fonts' fingerprint.

ALTER TABLE layers ADD COLUMN fonts_version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE base_versions ADD COLUMN fonts_version BIGINT NOT NULL DEFAULT 1;
