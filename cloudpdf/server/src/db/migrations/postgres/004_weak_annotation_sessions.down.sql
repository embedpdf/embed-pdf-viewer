-- Down for 004_weak_annotation_sessions.sql (Postgres).
--
-- Child pages table first (FK -> weak_annotation_sessions), then the
-- sessions table.

DROP TABLE weak_annotation_session_pages;
DROP TABLE weak_annotation_sessions;
