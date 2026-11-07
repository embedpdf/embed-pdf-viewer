-- Who a share link's visitors are (SQLite).
--
-- A link can ask its visitors who they are (`visitor_identity_json`: the
-- fields, when to ask, why). The answers are stored once per visitor in
-- `share_visitors` and go into every token issued for them; they are the
-- server's from then on. A row exists only for a visitor who answered or
-- wrote (their layer's first write makes it). The idle clock is the
-- visitor's: `last_seen_at` moves here from `layers`, and the link's
-- `visitor_layer_idle_seconds` becomes `visitor_idle_seconds`: after that
-- long unseen, when the link sets it, the visitor and their layer go.
CREATE TABLE share_visitors (
  grant_id            TEXT    NOT NULL REFERENCES share_grants(id) ON DELETE CASCADE,
  visitor_id          TEXT    NOT NULL,
  doc_id              TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  display_name        TEXT,
  email               TEXT,
  title               TEXT,
  organization        TEXT,
  organizational_unit TEXT,
  email_verified_at   INTEGER,
  consented_at        INTEGER,
  first_seen_at       INTEGER NOT NULL,
  last_seen_at        INTEGER NOT NULL,
  PRIMARY KEY (grant_id, visitor_id)
);
CREATE INDEX idx_share_visitors_grant_first
  ON share_visitors(grant_id, first_seen_at DESC, visitor_id DESC);
CREATE INDEX idx_share_visitors_grant_seen ON share_visitors(grant_id, last_seen_at);
INSERT INTO share_visitors (grant_id, visitor_id, doc_id, first_seen_at, last_seen_at)
  SELECT l.grant_id, l.visitor_id, l.doc_id, l.created_at, COALESCE(l.last_seen_at, l.created_at)
  FROM layers l
  WHERE l.grant_id IS NOT NULL AND l.visitor_id IS NOT NULL AND l.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM share_grants g WHERE g.id = l.grant_id);

DROP INDEX idx_layers_grant;
ALTER TABLE layers DROP COLUMN last_seen_at;
CREATE INDEX idx_layers_grant ON layers(grant_id, visitor_id);

ALTER TABLE share_grants ADD COLUMN visitor_identity_json TEXT;
ALTER TABLE share_grants RENAME COLUMN visitor_layer_idle_seconds TO visitor_idle_seconds;
