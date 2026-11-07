-- Down for 047_grants.sql (Postgres).
ALTER INDEX idx_grant_visitors_grant_seen RENAME TO idx_share_visitors_grant_seen;
ALTER INDEX idx_grant_visitors_grant_first RENAME TO idx_share_visitors_grant_first;
ALTER TABLE grant_visitors
  RENAME CONSTRAINT grant_visitors_doc_id_fkey TO share_visitors_doc_id_fkey;
ALTER TABLE grant_visitors
  RENAME CONSTRAINT grant_visitors_grant_id_fkey TO share_visitors_grant_id_fkey;
ALTER TABLE grant_visitors RENAME CONSTRAINT grant_visitors_pkey TO share_visitors_pkey;
ALTER TABLE grant_visitors RENAME TO share_visitors;

ALTER TABLE grants DROP COLUMN name;
ALTER TABLE grants RENAME COLUMN passphrase_hash TO password_hash;
ALTER INDEX idx_grants_doc RENAME TO idx_share_grants_doc;
ALTER INDEX idx_grants_tenant_created RENAME TO idx_share_grants_tenant_created;
ALTER TABLE grants RENAME CONSTRAINT grants_layer_name_by_mode TO share_grants_layer_name_by_mode;
ALTER TABLE grants RENAME CONSTRAINT grants_layer_mode_check TO share_grants_layer_mode_check;
ALTER TABLE grants RENAME CONSTRAINT grants_doc_id_fkey TO share_grants_doc_id_fkey;
ALTER TABLE grants RENAME CONSTRAINT grants_tenant_id_fkey TO share_grants_tenant_id_fkey;
ALTER TABLE grants RENAME CONSTRAINT grants_pkey TO share_grants_pkey;
ALTER TABLE grants RENAME TO share_grants;
