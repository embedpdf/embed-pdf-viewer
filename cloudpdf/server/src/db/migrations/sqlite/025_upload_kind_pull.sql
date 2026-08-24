-- upload_kind gains the 'pull' variant: the server-side import
-- transfer (documents.import) — the server pulls the bytes from a
-- caller-supplied source instead of the client pushing them.
-- SQLite added upload_kind as unconstrained TEXT (024), so this is a
-- no-op kept for dialect version parity with postgres.
SELECT 1;
