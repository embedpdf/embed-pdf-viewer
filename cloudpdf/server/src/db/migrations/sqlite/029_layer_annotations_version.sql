-- Bulk-annotations version pointer (SQLite).
--
-- `annotations_version` is the doc-level pointer for the immutable
-- whole-document /annotations/items@annotationsVersion leaf. It bumps
-- ONLY when annotation list BODIES change — annotation
-- create/update/delete/move, page insert/delete, redaction-apply,
-- flatten, and form field/widget structure — and deliberately NOT on
-- form value writes (widget DTOs carry no value; only /AP rasters
-- change, covered by the per-page annotation_version), metadata,
-- attachments, or page move/rotate (bulk page order is unspecified by
-- contract). The `metadata_version` independent-cadence design.

ALTER TABLE layers ADD COLUMN annotations_version INTEGER NOT NULL DEFAULT 1;
