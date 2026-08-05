-- Attachments version pointer (Postgres).
--
-- `attachments_version` is the doc-level pointer for the immutable
-- /attachments@attachmentsVersion listing and /attachment-files/…@…
-- byte leaves. It bumps only on attachment create/delete — a different
-- cadence than `doc_version`, so attachment caches stay warm across
-- unrelated edits and vice-versa (the `metadata_version` design).

ALTER TABLE layers ADD COLUMN attachments_version BIGINT NOT NULL DEFAULT 1;
