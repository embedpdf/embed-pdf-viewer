-- Down for 033_change_outcomes.sql (postgres).

ALTER TABLE audit_log DROP COLUMN undo_of;
ALTER TABLE layers DROP COLUMN undo_horizon;
DROP INDEX IF EXISTS idx_change_outcomes_expiry;
DROP TABLE IF EXISTS change_outcomes;
