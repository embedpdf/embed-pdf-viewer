-- Down for 001_initial.sql (SQLite).
--
-- Drops the base schema, child-before-parent so the documents -> tenants
-- foreign key never blocks the teardown. Dropping a table drops its
-- indexes, so the 001 indexes go with `documents`. `schema_migrations`
-- is owned by the runner and is intentionally left in place.

DROP TABLE documents;
DROP TABLE tenants;
