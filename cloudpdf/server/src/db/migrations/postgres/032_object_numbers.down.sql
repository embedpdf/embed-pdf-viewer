-- Down for 032_object_numbers.sql (postgres).

DROP INDEX IF EXISTS idx_object_number_blocks_session;
DROP TABLE IF EXISTS object_number_blocks;
DROP INDEX IF EXISTS idx_edit_sessions_expiry;
DROP TABLE IF EXISTS edit_sessions;
ALTER TABLE layers DROP COLUMN next_object_number;
