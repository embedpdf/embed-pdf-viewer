-- Object numbers by layer name (postgres).
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
  next_object_number BIGINT  NOT NULL,
  PRIMARY KEY (doc_id, layer_name)
);
INSERT INTO object_number_counters (doc_id, layer_name, base_sha, next_object_number)
  SELECT doc_id, name, base_sha, next_object_number FROM layers
  WHERE next_object_number IS NOT NULL;

ALTER TABLE edit_sessions
  ADD COLUMN doc_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  ADD COLUMN layer_name TEXT;
UPDATE edit_sessions s SET doc_id = l.doc_id, layer_name = l.name
  FROM layers l WHERE l.id = s.layer_id;
DROP INDEX idx_edit_sessions_expiry;
ALTER TABLE edit_sessions DROP CONSTRAINT edit_sessions_pkey;
ALTER TABLE edit_sessions DROP COLUMN layer_id;
ALTER TABLE edit_sessions
  ALTER COLUMN doc_id SET NOT NULL,
  ALTER COLUMN layer_name SET NOT NULL,
  ADD PRIMARY KEY (doc_id, layer_name, session_id);
CREATE INDEX idx_edit_sessions_expiry ON edit_sessions (doc_id, layer_name, expires_at);
-- The sweep finds the sessions that expired longest ago, on any layer.
CREATE INDEX idx_edit_sessions_expires_at ON edit_sessions (expires_at);

ALTER TABLE object_number_blocks
  ADD COLUMN doc_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  ADD COLUMN layer_name TEXT;
UPDATE object_number_blocks b SET doc_id = l.doc_id, layer_name = l.name
  FROM layers l WHERE l.id = b.layer_id;
DROP INDEX idx_object_number_blocks_session;
ALTER TABLE object_number_blocks DROP CONSTRAINT object_number_blocks_pkey;
ALTER TABLE object_number_blocks DROP COLUMN layer_id;
ALTER TABLE object_number_blocks
  ALTER COLUMN doc_id SET NOT NULL,
  ALTER COLUMN layer_name SET NOT NULL,
  ADD PRIMARY KEY (doc_id, layer_name, first);
CREATE INDEX idx_object_number_blocks_session
  ON object_number_blocks (doc_id, layer_name, session_id, first);

ALTER TABLE layers DROP COLUMN next_object_number;
