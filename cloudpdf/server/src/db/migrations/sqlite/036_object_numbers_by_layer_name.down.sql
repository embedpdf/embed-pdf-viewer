-- Down for 036_object_numbers_by_layer_name.sql (SQLite).
-- Numbering of layers without a row has nowhere to go and is dropped.

ALTER TABLE layers ADD COLUMN next_object_number INTEGER;
UPDATE layers SET next_object_number = (
  SELECT c.next_object_number FROM object_number_counters c
  WHERE c.doc_id = layers.doc_id AND c.layer_name = layers.name
);
DROP TABLE object_number_counters;

CREATE TABLE edit_sessions_by_id (
  layer_id   TEXT    NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  session_id TEXT    NOT NULL,
  sub        TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (layer_id, session_id)
);
INSERT INTO edit_sessions_by_id (layer_id, session_id, sub, expires_at, created_at)
  SELECT l.id, s.session_id, s.sub, s.expires_at, s.created_at
  FROM edit_sessions s JOIN layers l ON l.doc_id = s.doc_id AND l.name = s.layer_name;
DROP TABLE edit_sessions;
ALTER TABLE edit_sessions_by_id RENAME TO edit_sessions;
CREATE INDEX idx_edit_sessions_expiry ON edit_sessions (layer_id, expires_at);

CREATE TABLE object_number_blocks_by_id (
  layer_id   TEXT    NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  first      INTEGER NOT NULL,
  available  INTEGER NOT NULL,
  session_id TEXT,
  PRIMARY KEY (layer_id, first)
);
INSERT INTO object_number_blocks_by_id (layer_id, first, available, session_id)
  SELECT l.id, b.first, b.available, b.session_id
  FROM object_number_blocks b JOIN layers l ON l.doc_id = b.doc_id AND l.name = b.layer_name;
DROP TABLE object_number_blocks;
ALTER TABLE object_number_blocks_by_id RENAME TO object_number_blocks;
CREATE INDEX idx_object_number_blocks_session ON object_number_blocks (layer_id, session_id, first);
