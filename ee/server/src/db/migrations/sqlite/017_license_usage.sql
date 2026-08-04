CREATE TABLE license_usage_counter (
  metric TEXT NOT NULL CHECK (metric IN ('pdf.views', 'pdf.uploads')),
  period_start TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (metric, period_start)
);

CREATE TABLE license_usage_event (
  metric TEXT NOT NULL CHECK (metric = 'pdf.uploads'),
  event_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (metric, event_id)
);

CREATE TABLE license_reporting_state (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  pending_payload_json TEXT NULL,
  last_attempt_at INTEGER NULL,
  last_success_at INTEGER NULL,
  last_status TEXT NOT NULL DEFAULT 'never' CHECK (last_status IN ('never', 'success', 'failed')),
  last_error TEXT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE license_operation_lease (
  name TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
