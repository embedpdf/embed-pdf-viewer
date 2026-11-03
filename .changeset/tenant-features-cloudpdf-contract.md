---
'@cloudpdf/contract': minor
---

`tenants.update` (`PATCH /v1/tenants/:tenantId`) sets a tenant's `features`, the server modules it may use, and tenant records carry `features`. `TenantFeature` (`{ id, stopped?: 'cap' }`) is a named component.
