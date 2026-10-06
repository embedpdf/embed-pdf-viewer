-- Drop weak annotation state (SQLite).
--
-- Every annotation now has a permanent name (its object number, or its
-- position in the uploaded file), so nothing validates positional refs and
-- nothing guards weak edits: the per-page annotation generation and weak
-- flag, and the weak annotation edit sessions, go.

DROP TABLE weak_annotation_session_pages;
DROP TABLE weak_annotation_sessions;

ALTER TABLE document_pages DROP COLUMN annotation_generation;
ALTER TABLE document_pages DROP COLUMN has_weak_annotations;

ALTER TABLE layer_pages DROP COLUMN annotation_generation;
ALTER TABLE layer_pages DROP COLUMN has_weak_annotations;
