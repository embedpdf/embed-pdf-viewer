-- Down for 036_object_numbers_by_layer_name.sql (postgres).
-- Numbering of layers without a row has nowhere to go and is dropped.

ALTER TABLE layers ADD COLUMN next_object_number BIGINT;
UPDATE layers l SET next_object_number = c.next_object_number
  FROM object_number_counters c WHERE c.doc_id = l.doc_id AND c.layer_name = l.name;
DROP TABLE object_number_counters;

DROP INDEX idx_edit_sessions_expires_at;
DELETE FROM edit_sessions s
  WHERE NOT EXISTS (SELECT 1 FROM layers l WHERE l.doc_id = s.doc_id AND l.name = s.layer_name);
ALTER TABLE edit_sessions ADD COLUMN layer_id TEXT REFERENCES layers(id) ON DELETE CASCADE;
UPDATE edit_sessions s SET layer_id = l.id
  FROM layers l WHERE l.doc_id = s.doc_id AND l.name = s.layer_name;
DROP INDEX idx_edit_sessions_expiry;
ALTER TABLE edit_sessions DROP CONSTRAINT edit_sessions_pkey;
ALTER TABLE edit_sessions DROP COLUMN doc_id, DROP COLUMN layer_name;
ALTER TABLE edit_sessions
  ALTER COLUMN layer_id SET NOT NULL,
  ADD PRIMARY KEY (layer_id, session_id);
CREATE INDEX idx_edit_sessions_expiry ON edit_sessions (layer_id, expires_at);

DELETE FROM object_number_blocks b
  WHERE NOT EXISTS (SELECT 1 FROM layers l WHERE l.doc_id = b.doc_id AND l.name = b.layer_name);
ALTER TABLE object_number_blocks ADD COLUMN layer_id TEXT REFERENCES layers(id) ON DELETE CASCADE;
UPDATE object_number_blocks b SET layer_id = l.id
  FROM layers l WHERE l.doc_id = b.doc_id AND l.name = b.layer_name;
DROP INDEX idx_object_number_blocks_session;
ALTER TABLE object_number_blocks DROP CONSTRAINT object_number_blocks_pkey;
ALTER TABLE object_number_blocks DROP COLUMN doc_id, DROP COLUMN layer_name;
ALTER TABLE object_number_blocks
  ALTER COLUMN layer_id SET NOT NULL,
  ADD PRIMARY KEY (layer_id, first);
CREATE INDEX idx_object_number_blocks_session ON object_number_blocks (layer_id, session_id, first);
