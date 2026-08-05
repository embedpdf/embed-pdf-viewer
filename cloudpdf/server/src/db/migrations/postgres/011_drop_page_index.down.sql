-- Down for 011_drop_page_index.sql (Postgres).
--
-- Recreate page_index + its unique indexes from the original
-- 003_layer_state.sql definitions (BIGINT to match the PG dialect).
-- NOT NULL DEFAULT 0 lets the column re-add on a populated table;
-- per-page page_index values are not recoverable (structure-only).

ALTER TABLE document_pages ADD COLUMN page_index BIGINT NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX uq_document_pages_doc_index
  ON document_pages(doc_id, page_index);

ALTER TABLE layer_pages ADD COLUMN page_index BIGINT NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX uq_layer_pages_layer_index
  ON layer_pages(layer_id, page_index);
