---
'@cloudpdf/admin': major
---

Reworks the backend administration SDK around explicit tenant addressing and deployment API-token authentication.

- Replaces the flat document client with `cloud.tenant(tenantId)`, accepting exactly one root `apiToken` or delegated `tenantToken` credential.
- Adds tenant lifecycle APIs for creating, listing, iterating, retrieving, and deleting tenants.
- Adds tenant token APIs for issuing document or tenant JWTs and revoking them by `jti`.
- Adds keyset-paginated document listing, lifecycle-state filtering, and an async document iterator.
- Moves the SDK's shared schemas and route definitions to `@cloudpdf/contract`.
