-- Grants (Postgres): share links are grants now.
--
-- `share_grants` becomes `grants` and `share_visitors` becomes
-- `grant_visitors`, with their indexes and constraints. The passphrase
-- column says so (`passphrase_hash`), and a grant gets a `name`
-- ("Website", "Sent to Acme"); NULL for one without. Ids are kept: new
-- grants are `grt_…`, and the `shr_…` ones made before keep working.
ALTER TABLE share_grants RENAME TO grants;
ALTER TABLE grants RENAME CONSTRAINT share_grants_pkey TO grants_pkey;
ALTER TABLE grants RENAME CONSTRAINT share_grants_tenant_id_fkey TO grants_tenant_id_fkey;
ALTER TABLE grants RENAME CONSTRAINT share_grants_doc_id_fkey TO grants_doc_id_fkey;
ALTER TABLE grants RENAME CONSTRAINT share_grants_layer_mode_check TO grants_layer_mode_check;
ALTER TABLE grants RENAME CONSTRAINT share_grants_layer_name_by_mode TO grants_layer_name_by_mode;
ALTER INDEX idx_share_grants_tenant_created RENAME TO idx_grants_tenant_created;
ALTER INDEX idx_share_grants_doc RENAME TO idx_grants_doc;
ALTER TABLE grants RENAME COLUMN password_hash TO passphrase_hash;
ALTER TABLE grants ADD COLUMN name TEXT;

ALTER TABLE share_visitors RENAME TO grant_visitors;
ALTER TABLE grant_visitors RENAME CONSTRAINT share_visitors_pkey TO grant_visitors_pkey;
ALTER TABLE grant_visitors
  RENAME CONSTRAINT share_visitors_grant_id_fkey TO grant_visitors_grant_id_fkey;
ALTER TABLE grant_visitors
  RENAME CONSTRAINT share_visitors_doc_id_fkey TO grant_visitors_doc_id_fkey;
ALTER INDEX idx_share_visitors_grant_first RENAME TO idx_grant_visitors_grant_first;
ALTER INDEX idx_share_visitors_grant_seen RENAME TO idx_grant_visitors_grant_seen;
