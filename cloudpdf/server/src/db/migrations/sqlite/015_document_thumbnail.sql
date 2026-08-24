-- Document thumbnail lifecycle (SQLite).
--
-- `thumbnail_state` drives the dashboard tile:
--   pending  -> not yet warmed (skeleton tile; read-through still works)
--   ready    -> the warm lattice artifact exists
--   locked   -> user-password document: NO derived artifact, by design —
--               a thumbnail is content disclosure
--   failed   -> warm attempt errored (read-through remains the repair path)
--
-- `thumbnail_key` is the storage key of the warmed base-tier artifact so
-- list/serve paths never have to reconstruct canonical tokens or know the
-- first page's object number.

ALTER TABLE documents ADD COLUMN thumbnail_state TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN thumbnail_key TEXT NULL;
