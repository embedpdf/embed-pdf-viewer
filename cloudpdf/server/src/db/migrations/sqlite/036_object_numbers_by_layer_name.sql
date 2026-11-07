-- Object numbers by layer name (SQLite).
--
-- A layer nobody changed has no row: it reads the head version. Its editing
-- sessions are handed numbers all the same, counted past the head's last
-- object number, so opening a document makes no layer; the row comes with
-- the first write. The counter, the sessions and their blocks are keyed by
-- the layer's document and name (a name never goes to another layer), and
-- the counter keeps the base version it counts on: on another one, its
-- numbers count anew, as after a publish.
CREATE TABLE object_number_counters (
  doc_id             TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  layer_name         TEXT    NOT NULL,
  base_sha           TEXT,
  next_object_number INTEGER NOT NULL,
  PRIMARY KEY (doc_id, layer_name)
);
INSERT INTO object_number_counters (doc_id, layer_name, base_sha, next_object_number)
  SELECT doc_id, name, base_sha, next_object_number FROM layers
  WHERE next_object_number IS NOT NULL;

CREATE TABLE edit_sessions_by_name (
  doc_id     TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  layer_name TEXT    NOT NULL,
  session_id TEXT    NOT NULL,
  sub        TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (doc_id, layer_name, session_id)
);
INSERT INTO edit_sessions_by_name (doc_id, layer_name, session_id, sub, expires_at, created_at)
  SELECT l.doc_id, l.name, s.session_id, s.sub, s.expires_at, s.created_at
  FROM edit_sessions s JOIN layers l ON l.id = s.layer_id;
DROP TABLE edit_sessions;
ALTER TABLE edit_sessions_by_name RENAME TO edit_sessions;
CREATE INDEX idx_edit_sessions_expiry ON edit_sessions (doc_id, layer_name, expires_at);
-- The sweep finds the sessions that expired longest ago, on any layer.
CREATE INDEX idx_edit_sessions_expires_at ON edit_sessions (expires_at);

CREATE TABLE object_number_blocks_by_name (
  doc_id     TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  layer_name TEXT    NOT NULL,
  first      INTEGER NOT NULL,
  available  INTEGER NOT NULL,
  session_id TEXT,
  PRIMARY KEY (doc_id, layer_name, first)
);
INSERT INTO object_number_blocks_by_name (doc_id, layer_name, first, available, session_id)
  SELECT l.doc_id, l.name, b.first, b.available, b.session_id
  FROM object_number_blocks b JOIN layers l ON l.id = b.layer_id;
DROP TABLE object_number_blocks;
ALTER TABLE object_number_blocks_by_name RENAME TO object_number_blocks;
CREATE INDEX idx_object_number_blocks_session
  ON object_number_blocks (doc_id, layer_name, session_id, first);

ALTER TABLE layers DROP COLUMN next_object_number;
