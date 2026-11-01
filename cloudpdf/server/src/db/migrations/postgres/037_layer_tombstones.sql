-- Deleted layers (postgres).
--
-- Deleting a layer removes what it stored and keeps its row as a tombstone:
-- `deleted_at` set, its version counters and its pages' as they were. Read
-- URLs name the layer and its versions and are cached as immutable, so a
-- layer made again under the same name would serve its predecessor's bytes.
-- A deleted name is refused from then on.
ALTER TABLE layers ADD COLUMN deleted_at BIGINT;
