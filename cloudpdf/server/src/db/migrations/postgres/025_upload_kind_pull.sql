-- upload_kind gains the 'pull' variant: the server-side import
-- transfer (documents.import) — the server pulls the bytes from a
-- caller-supplied source instead of the client pushing them.
ALTER TABLE documents DROP CONSTRAINT documents_upload_kind_check;
ALTER TABLE documents ADD CONSTRAINT documents_upload_kind_check
  CHECK (upload_kind IS NULL OR upload_kind IN ('presigned', 'proxy', 'pull'));
