-- Down for 040_layers_list_index.sql.

DROP INDEX idx_layers_doc_created;
CREATE INDEX idx_layers_doc ON layers(doc_id);
