-- Down for 038_visitor_layers.sql (postgres). Per-visitor links go: they
-- name no layer.

DROP INDEX IF EXISTS idx_layers_grant;
ALTER TABLE layers
  DROP COLUMN last_seen_at,
  DROP COLUMN visitor_id,
  DROP COLUMN grant_id;

DELETE FROM share_grants WHERE layer_mode <> 'shared';
ALTER TABLE share_grants
  DROP CONSTRAINT share_grants_layer_name_by_mode,
  ALTER COLUMN layer_name SET DEFAULT 'default',
  ALTER COLUMN layer_name SET NOT NULL,
  DROP COLUMN visitor_layer_idle_seconds,
  DROP COLUMN keep_visitor_layers,
  DROP COLUMN layer_mode;
