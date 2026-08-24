-- Down for 001_initial.sql (Postgres).
--
-- Drops the base schema, child-before-parent so the documents -> tenants
-- foreign key never blocks the teardown. Dropping a table drops its
-- indexes. `schema_migrations` is owned by the runner and left in place.

DROP TABLE documents;
DROP TABLE tenants;
