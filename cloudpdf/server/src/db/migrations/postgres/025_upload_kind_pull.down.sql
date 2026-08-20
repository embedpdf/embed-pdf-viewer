UPDATE documents SET upload_kind = NULL WHERE upload_kind = 'pull';
ALTER TABLE documents DROP CONSTRAINT documents_upload_kind_check;
ALTER TABLE documents ADD CONSTRAINT documents_upload_kind_check
  CHECK (upload_kind IS NULL OR upload_kind IN ('presigned', 'proxy'));
