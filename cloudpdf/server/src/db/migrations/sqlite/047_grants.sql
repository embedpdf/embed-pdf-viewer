-- Grants (SQLite): share links are grants now.
--
-- `share_grants` becomes `grants` and `share_visitors` becomes
-- `grant_visitors`, with their indexes; renaming `share_grants` rewrites
-- the visitors' foreign key to it. The passphrase column says so
-- (`passphrase_hash`), and a grant gets a `name` ("Website", "Sent to
-- Acme"); NULL for one without. Ids are kept: new grants are `grt_…`, and
-- the `shr_…` ones made before keep working.
ALTER TABLE share_grants RENAME TO grants;
DROP INDEX idx_share_grants_tenant_created;
DROP INDEX idx_share_grants_doc;
CREATE INDEX idx_grants_tenant_created ON grants(tenant_id, created_at DESC, id DESC);
CREATE INDEX idx_grants_doc ON grants(doc_id);
ALTER TABLE grants RENAME COLUMN password_hash TO passphrase_hash;
ALTER TABLE grants ADD COLUMN name TEXT;

ALTER TABLE share_visitors RENAME TO grant_visitors;
DROP INDEX idx_share_visitors_grant_first;
DROP INDEX idx_share_visitors_grant_seen;
CREATE INDEX idx_grant_visitors_grant_first
  ON grant_visitors(grant_id, first_seen_at DESC, visitor_id DESC);
CREATE INDEX idx_grant_visitors_grant_seen ON grant_visitors(grant_id, last_seen_at);
