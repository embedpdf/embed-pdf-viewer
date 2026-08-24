-- Down for 003_layer_state.sql (Postgres).
--
-- Reverse FK-dependency order: layer_pages -> layers -> document_pages,
-- then strip the doc_version column 003 added to documents.

DROP TABLE layer_pages;
DROP TABLE layers;
DROP TABLE document_pages;
ALTER TABLE documents DROP COLUMN doc_version;
