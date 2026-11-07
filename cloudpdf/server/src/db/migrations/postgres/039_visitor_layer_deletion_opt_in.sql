-- Deleting visitors' layers is the link owner's choice (postgres).
--
-- `visitor_layer_idle_seconds` NULL: a visitor's layer stays until it is
-- deleted on purpose (what a visitor filled in is often the only copy). A
-- link sets an idle time only when its visitors' layers are throwaway.
-- Links on migration 038's 7-day default keep their layers from now on.
ALTER TABLE share_grants
  ALTER COLUMN visitor_layer_idle_seconds DROP NOT NULL,
  ALTER COLUMN visitor_layer_idle_seconds DROP DEFAULT;
UPDATE share_grants SET visitor_layer_idle_seconds = NULL
  WHERE visitor_layer_idle_seconds = 604800;
