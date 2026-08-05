-- Document-metadata version pointer (Postgres).
--
-- `metadata_version` is the doc-level pointer for the immutable
-- /metadata@metadataVersion leaf. It bumps only on metadata writes
-- (Info-dict edits) — a different cadence than `doc_version` and
-- `layout_version`, so page/annotation caches stay warm across a
-- metadata edit and vice-versa.

ALTER TABLE layers ADD COLUMN metadata_version BIGINT NOT NULL DEFAULT 1;
