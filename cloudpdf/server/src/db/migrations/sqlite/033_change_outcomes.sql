-- Changes: what each one answered, and what undoes it (sqlite).
--
-- A change (one user action, `POST …/changes`, or a single-op route) keeps
-- its answer under its opId, refusals included, so a retry gets the same
-- one, and a different change under the opId is refused. An applied change
-- that can be undone keeps the reverse the engine recorded (JSON) and, when
-- it captured anything, the key of its capture blob in the object store.
-- Rows expire after the retention period; an undo naming an expired or
-- unknown change is refused as expired.
CREATE TABLE change_outcomes (
  layer_id     TEXT    NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  op_id        TEXT    NOT NULL,
  payload_hash TEXT    NOT NULL,
  status       TEXT    NOT NULL,
  response     TEXT    NOT NULL,
  actor        TEXT    NOT NULL,
  audit_id     INTEGER,
  reverse      TEXT,
  capture_key  TEXT,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  PRIMARY KEY (layer_id, op_id)
);
CREATE INDEX idx_change_outcomes_expiry ON change_outcomes (expires_at);

-- The audit id of the layer's last final change (redaction apply, flatten,
-- signing, form repair): no change before it can be undone. NULL: none yet.
ALTER TABLE layers ADD COLUMN undo_horizon INTEGER;

-- An undo's audit row names the change it undid.
ALTER TABLE audit_log ADD COLUMN undo_of TEXT;
