-- Down for 041_share_grants_archived.sql (postgres). Archived links go: they
-- exchange no more either way.

DELETE FROM share_grants WHERE archived_at IS NOT NULL;
ALTER TABLE share_grants DROP COLUMN archived_at;
