-- Page-geometry version pointer (SQLite).
--
-- `layout_version` is the doc-level pointer for the immutable
-- /layout@layoutVersion leaf. It bumps only on structural page ops
-- (move/insert/delete/rotate) — a different cadence than `doc_version`,
-- so per-page render/text/annotation caches stay warm across a reorder.

ALTER TABLE layers ADD COLUMN layout_version INTEGER NOT NULL DEFAULT 1;
