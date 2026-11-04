-- The document's contents pin (Postgres).
--
-- `contents_version` is the doc-level pointer a read across every page's
-- content pins (search). It moves in the same transaction as any write that
-- moves a page's `content_version`, inserts a page or deletes one.

ALTER TABLE layers ADD COLUMN contents_version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE base_versions ADD COLUMN contents_version BIGINT NOT NULL DEFAULT 1;
