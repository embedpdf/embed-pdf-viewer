-- Tenant features (Postgres): the server modules a tenant may use, by module id.
-- A module's routes answer only tenants whose list holds it; a feature's
-- `stopped` ('cap') keeps it on the list but stops its routes (402). Set
-- by the operator through the tenants API; the engine never decides one,
-- as it never decides a suspension. A JSON array of `{ id, stopped? }`,
-- empty for every tenant until the operator sets it.

ALTER TABLE tenants ADD COLUMN features_json TEXT NOT NULL DEFAULT '[]';
