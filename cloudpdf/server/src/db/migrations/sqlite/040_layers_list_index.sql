-- A document's layers newest first: the order `documents.layers.list`
-- pages by. It covers lookups by document alone, so the old index goes.
DROP INDEX idx_layers_doc;
CREATE INDEX idx_layers_doc_created ON layers(doc_id, created_at DESC, id DESC);
