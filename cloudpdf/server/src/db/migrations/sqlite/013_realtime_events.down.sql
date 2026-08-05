-- Down for 013_realtime_events.sql (SQLite).
-- Plain columns, no CHECK/index, so DROP COLUMN works directly.

ALTER TABLE audit_log DROP COLUMN origin_session_id;
ALTER TABLE layers DROP COLUMN last_audit_id;
