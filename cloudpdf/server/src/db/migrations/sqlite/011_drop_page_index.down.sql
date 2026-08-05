-- Down for 011_drop_page_index.sql (SQLite).
--
-- 011 dropped page_index + its unique indexes from document_pages and
-- layer_pages. Recreate them from the original 003_layer_state.sql
-- definitions. The NOT NULL DEFAULT 0 lets the column re-add on a
-- populated table; per-page page_index values are not recoverable
-- (structure-only rollback), which is harmless pre-launch.

ALTER TABLE document_pages ADD COLUMN page_index INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX uq_document_pages_doc_index
  ON document_pages(doc_id, page_index);

ALTER TABLE layer_pages ADD COLUMN page_index INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX uq_layer_pages_layer_index
  ON layer_pages(layer_id, page_index);
