-- Down for 042_share_visitors.sql (SQLite). The answers go; the idle clock
-- goes back to the visitors' layers.

ALTER TABLE share_grants RENAME COLUMN visitor_idle_seconds TO visitor_layer_idle_seconds;
ALTER TABLE share_grants DROP COLUMN visitor_identity_json;

DROP INDEX idx_layers_grant;
ALTER TABLE layers ADD COLUMN last_seen_at INTEGER;
UPDATE layers SET last_seen_at = (
  SELECT v.last_seen_at FROM share_visitors v
  WHERE v.grant_id = layers.grant_id AND v.visitor_id = layers.visitor_id
) WHERE grant_id IS NOT NULL;
CREATE INDEX idx_layers_grant ON layers(grant_id, last_seen_at);

DROP TABLE share_visitors;
