-- Down for 047_grants.sql (SQLite).
DROP INDEX idx_grant_visitors_grant_first;
DROP INDEX idx_grant_visitors_grant_seen;
ALTER TABLE grant_visitors RENAME TO share_visitors;
CREATE INDEX idx_share_visitors_grant_first
  ON share_visitors(grant_id, first_seen_at DESC, visitor_id DESC);
CREATE INDEX idx_share_visitors_grant_seen ON share_visitors(grant_id, last_seen_at);

ALTER TABLE grants DROP COLUMN name;
ALTER TABLE grants RENAME COLUMN passphrase_hash TO password_hash;
DROP INDEX idx_grants_tenant_created;
DROP INDEX idx_grants_doc;
ALTER TABLE grants RENAME TO share_grants;
CREATE INDEX idx_share_grants_tenant_created
  ON share_grants(tenant_id, created_at DESC, id DESC);
CREATE INDEX idx_share_grants_doc ON share_grants(doc_id);
