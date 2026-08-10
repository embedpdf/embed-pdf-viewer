---
'@cloudpdf/contract': minor
---

Adds the share-grant contract: standing, revocable authorization decisions that let a document be embedded with no backend.

- Defines `shares.create`, `shares.list`, `shares.get`, `shares.update`, and `shares.delete` under `/v1/tenants/:tenantId/shares`, governed by the new `shares.manage` tenant scope.
- Defines `shares.exchange` at `POST /v1/share-sessions`, the contract's only unauthenticated operation: the grant row is the authorization, so a public share token trades for a short-lived document session JWT. The registry test now pins that surface, making any future credential-less operation an explicit decision.
- Adds an optional `origins` allowlist to document-token issuance, so a minted token can be restricted to named web origins.
- Adds `tenants.usage` for per-tenant usage facts, plus `tenants.suspend` and `tenants.resume` for operator-controlled tenant suspension.
- Reports tenant `status` on tenant records and regenerates `openapi.json`, which now carries 44 operations.
