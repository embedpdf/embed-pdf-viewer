-- Drop page_index (SQLite).
--
-- Display order is no longer a durable column: it lives in the layer
-- artifact and is read back via /layout (PageLayout.index). A page move
-- therefore stops reshuffling `(layer_id, page_index)`, so the unique
-- indexes and the columns themselves are removed. Pages are addressed
-- exclusively by `page_object_number`.

DROP INDEX uq_document_pages_doc_index;
ALTER TABLE document_pages DROP COLUMN page_index;

DROP INDEX uq_layer_pages_layer_index;
ALTER TABLE layer_pages DROP COLUMN page_index;
