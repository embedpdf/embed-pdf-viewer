-- Document thumbnail lifecycle (Postgres).
-- See the SQLite twin for the state semantics.

ALTER TABLE documents ADD COLUMN thumbnail_state TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN thumbnail_key TEXT NULL;
