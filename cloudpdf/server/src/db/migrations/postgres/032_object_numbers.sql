-- Object numbers handed to editing sessions (postgres).
--
-- A new annotation, page, form field or widget can be named before it
-- exists: the server hands each editing session object numbers in advance,
-- and a create names one. `layers.next_object_number` is the layer's
-- counter, NULL until a layer first needs numbers. Every number below it
-- that no committed object used is in a block, held by a session or
-- returned by a write for the next session that needs numbers. It starts
-- past the last number the engine reports when it first opens the layer.
ALTER TABLE layers ADD COLUMN next_object_number BIGINT;

-- An editing session: an engine instance (its X-Engine-Session-Id) acting
-- for one token subject on one layer. It lives while its expiry keeps
-- moving forward, and its blocks go to another session once it expires.
CREATE TABLE edit_sessions (
  layer_id   TEXT    NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  session_id TEXT    NOT NULL,
  sub        TEXT    NOT NULL,
  expires_at BIGINT  NOT NULL,
  created_at BIGINT  NOT NULL,
  PRIMARY KEY (layer_id, session_id)
);
CREATE INDEX idx_edit_sessions_expiry ON edit_sessions (layer_id, expires_at);

-- Up to 32 numbers from `first`, bit i of `available` set while
-- `first + i` is unspent. `session_id` NULL: returned by a write, free for
-- any session.
CREATE TABLE object_number_blocks (
  layer_id   TEXT    NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  first      BIGINT  NOT NULL,
  available  BIGINT  NOT NULL,
  session_id TEXT,
  PRIMARY KEY (layer_id, first)
);
CREATE INDEX idx_object_number_blocks_session ON object_number_blocks (layer_id, session_id, first);
