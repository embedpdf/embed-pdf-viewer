-- Down for 044_versions_by_layer.sql (postgres). One numbering per document
-- again; documents moved back to their upload stay there.
DROP INDEX idx_base_versions_layer_number;
DROP INDEX idx_base_versions_upload;
ALTER TABLE base_versions
  DROP COLUMN layer_id,
  ADD CONSTRAINT base_versions_doc_id_number_key UNIQUE (doc_id, number);
