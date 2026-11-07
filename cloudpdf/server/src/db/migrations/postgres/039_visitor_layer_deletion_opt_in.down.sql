-- Down for 039_visitor_layer_deletion_opt_in.sql (postgres): links that keep
-- their visitors' layers go back to the 7-day default.

UPDATE share_grants SET visitor_layer_idle_seconds = 604800
  WHERE visitor_layer_idle_seconds IS NULL;
ALTER TABLE share_grants
  ALTER COLUMN visitor_layer_idle_seconds SET DEFAULT 604800,
  ALTER COLUMN visitor_layer_idle_seconds SET NOT NULL;
