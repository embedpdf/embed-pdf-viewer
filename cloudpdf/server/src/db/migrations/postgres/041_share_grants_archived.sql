-- Archived share links (postgres).
--
-- Archiving ends a link for good: it exchanges no more, and its row stays
-- with what its visitors made, still listed and downloadable. A link whose
-- visitors made changes is archived rather than deleted, so ending a link
-- never deletes their work. NULL for a link that still works.
ALTER TABLE share_grants ADD COLUMN archived_at BIGINT;
