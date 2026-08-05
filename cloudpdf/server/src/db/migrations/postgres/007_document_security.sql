ALTER TABLE documents ADD COLUMN encryption_state TEXT NOT NULL DEFAULT 'unknown'
  CHECK (encryption_state IN ('unknown','none','encrypted','unsupported'));

ALTER TABLE documents ADD COLUMN encryption_requires_password BOOLEAN;
ALTER TABLE documents ADD COLUMN security_handler_revision INTEGER;
ALTER TABLE documents ADD COLUMN pdf_permissions_bits BIGINT;
ALTER TABLE documents ADD COLUMN pdf_permissions_all_allowed BOOLEAN;
ALTER TABLE documents ADD COLUMN pdf_opened_as TEXT
  CHECK (pdf_opened_as IS NULL OR pdf_opened_as IN ('none','user','owner'));
ALTER TABLE documents ADD COLUMN security_probed_at BIGINT;
