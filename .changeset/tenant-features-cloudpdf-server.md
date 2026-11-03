---
'@cloudpdf/server': minor
---

Tenants have `features`: the server modules each tenant may use, by module id. A module's routes answer only tenants whose features hold it; others get `403 FeatureNotEnabled`, and a feature held as `{ id, stopped: 'cap' }` answers `402 FeatureStopped`. A new tenant has none: the operator turns modules on per tenant with `PATCH /v1/tenants/:tenantId` (API token only, every id an installed module), and other replicas follow within 30 seconds. Migration 050 adds the column on SQLite and Postgres.
