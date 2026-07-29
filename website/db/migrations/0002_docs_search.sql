CREATE EXTENSION IF NOT EXISTS vector;

--> statement-breakpoint

-- One row per heading-scoped section of a *content source* page. Integration
-- routes are resolved at query time, so `docs/headless/plugins/stage` is stored
-- once rather than once per framework.
CREATE TABLE IF NOT EXISTS docs_search_sections (
  id text PRIMARY KEY,
  content_path text NOT NULL,
  anchor text,
  page_title text NOT NULL,
  page_description text,
  section_title text,
  breadcrumb jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(breadcrumb) = 'array'),
  product text CHECK (product IS NULL OR product IN ('viewer', 'headless', 'engine')),
  depth integer NOT NULL DEFAULT 0,
  ordinal integer NOT NULL DEFAULT 0,
  prose text NOT NULL DEFAULT '',
  -- Prose that only one integration shows (an `<Fw only=…>` branch).
  variant_prose jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Identifiers keyed by integration; '*' holds the ones every framework shares.
  symbols jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Flattened projections of the two jsonb columns above. Kept as plain text so
  -- the tsvector below can be a STORED generated column: Postgres requires an
  -- immutable expression, and jsonb flattening is not.
  symbols_text text NOT NULL DEFAULT '',
  variant_prose_text text NOT NULL DEFAULT '',
  content_hash text NOT NULL,
  embedding vector(512),
  revision text NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(symbols_text, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(section_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(page_title, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(page_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(prose, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(variant_prose_text, '')), 'D')
  ) STORED
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS docs_search_sections_fts_idx
  ON docs_search_sections USING gin (search_vector);

--> statement-breakpoint

-- Cosine distance, matching the `<=>` operator the hybrid query uses.
CREATE INDEX IF NOT EXISTS docs_search_sections_embedding_idx
  ON docs_search_sections USING hnsw (embedding vector_cosine_ops);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS docs_search_sections_page_idx
  ON docs_search_sections (content_path, ordinal);

--> statement-breakpoint

-- Query embeddings are the only per-request call to an external provider.
-- Docs traffic is heavily repeated ("getting started", "zoom", "annotations"),
-- so caching them removes both the latency and the cost from the common path.
CREATE TABLE IF NOT EXISTS docs_search_query_cache (
  query_hash text PRIMARY KEY,
  query text NOT NULL,
  model text NOT NULL,
  embedding vector(512) NOT NULL,
  hit_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS docs_search_query_cache_last_used_idx
  ON docs_search_query_cache (last_used_at);
