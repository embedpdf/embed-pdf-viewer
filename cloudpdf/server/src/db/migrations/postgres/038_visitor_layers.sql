-- Whose layer a share link's visitors write into (postgres).
--
-- `layer_mode` 'shared': every visitor reads and writes the link's
-- `layer_name`. 'per-visitor': each visitor gets a layer of their own,
-- `visitor-<id>`, made at their first write, so the link names no layer.
-- `keep_visitor_layers`: whether a visitor's browser keeps its layer for
-- the next visit. `visitor_layer_idle_seconds`: how long a visitor's layer
-- lives unvisited before it is deleted.
ALTER TABLE share_grants
  ADD COLUMN layer_mode TEXT NOT NULL DEFAULT 'shared'
    CHECK (layer_mode IN ('shared', 'per-visitor')),
  ADD COLUMN keep_visitor_layers INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN visitor_layer_idle_seconds INTEGER NOT NULL DEFAULT 604800,
  ALTER COLUMN layer_name DROP NOT NULL,
  ALTER COLUMN layer_name DROP DEFAULT,
  ADD CONSTRAINT share_grants_layer_name_by_mode
    CHECK ((layer_mode = 'shared') = (layer_name IS NOT NULL));

-- A visitor's layer, from its first write: the link that made it, the
-- visitor, and when they last opened it (the idle clock).
ALTER TABLE layers
  ADD COLUMN grant_id TEXT,
  ADD COLUMN visitor_id TEXT,
  ADD COLUMN last_seen_at BIGINT;
CREATE INDEX idx_layers_grant ON layers(grant_id, last_seen_at);
