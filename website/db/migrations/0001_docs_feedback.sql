CREATE TABLE IF NOT EXISTS docs_feedback (
  id uuid PRIMARY KEY,
  site text NOT NULL CHECK (site IN ('embedpdf', 'cloudpdf')),
  path text NOT NULL CHECK (char_length(path) <= 512),
  framework text,
  section_id text CHECK (section_id IS NULL OR char_length(section_id) <= 128),
  helpful boolean NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasons) = 'array'),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 1000),
  docs_revision text NOT NULL,
  environment text NOT NULL,
  deployment text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS docs_feedback_page_created_idx
  ON docs_feedback (site, path, created_at DESC);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS docs_feedback_status_created_idx
  ON docs_feedback (status, created_at DESC);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS docs_feedback_rate_limits (
  rate_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0)
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS docs_feedback_rate_window_idx
  ON docs_feedback_rate_limits (window_started_at);
