-- Mirror the postgres down: forget the 'pull' variant.
UPDATE documents SET upload_kind = NULL WHERE upload_kind = 'pull';
