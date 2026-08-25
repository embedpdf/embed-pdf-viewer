-- Engine crash journal (WS3 Phase A §5): every engine-host death is
-- recorded with its in-flight suspects; quarantine decisions are rows
-- too (written even in observe-only mode — enforcement is a read-side
-- flag), so staging data validates attribution before any refusal.

CREATE TABLE engine_crashes (
  id                TEXT PRIMARY KEY,
  at                BIGINT NOT NULL,
  exit_code         INTEGER,
  exit_signal       TEXT,
  engine_build      TEXT NOT NULL,
  suspect_count     INTEGER NOT NULL,
  likely_candidates TEXT
);
CREATE INDEX idx_engine_crashes_build_at ON engine_crashes (engine_build, at);

CREATE TABLE engine_crash_suspects (
  crash_id  TEXT NOT NULL REFERENCES engine_crashes(id) ON DELETE CASCADE,
  base_sha  TEXT NOT NULL,
  -- The RAW wire kind (e.g. 'pages.render') — full forensic detail, no
  -- taxonomy to maintain. Pairing does not key on it: the exit
  -- signature types the incident; sole-suspect + sha + build identify
  -- the document.
  op_kind   TEXT NOT NULL,
  doc_id    TEXT,
  PRIMARY KEY (crash_id, base_sha, op_kind)
);
CREATE INDEX idx_engine_crash_suspects_sha ON engine_crash_suspects (base_sha);

CREATE TABLE engine_quarantine (
  base_sha               TEXT NOT NULL,
  engine_build           TEXT NOT NULL,
  reason                 TEXT NOT NULL,
  quarantined_at         BIGINT NOT NULL,
  expires_at             BIGINT NOT NULL,
  sole_suspect_crash_ids TEXT,
  PRIMARY KEY (base_sha, engine_build)
);

CREATE TABLE engine_quarantine_audit (
  id           TEXT PRIMARY KEY,
  cleared_at   BIGINT NOT NULL,
  base_sha     TEXT NOT NULL,
  engine_build TEXT,
  actor        TEXT NOT NULL,
  reason       TEXT NOT NULL
);
