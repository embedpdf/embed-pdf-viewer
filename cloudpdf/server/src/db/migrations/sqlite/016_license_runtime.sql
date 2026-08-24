CREATE TABLE license_runtime_state (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  deployment_id TEXT NOT NULL UNIQUE,
  license_mode TEXT NULL CHECK (license_mode IN ('connected', 'air-gapped')),
  license_key_fingerprint TEXT NULL,
  keygen_license_id TEXT NULL,
  installed_certificate TEXT NULL,
  certificate_installed_at INTEGER NULL,
  last_validated_at INTEGER NULL,
  last_observed_time INTEGER NOT NULL,
  validation_data_json TEXT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
