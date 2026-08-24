---
'@cloudpdf/server': minor
---

Implements share grants, origin locking, per-tenant usage, and tenant suspension.

- Stores share grants whose row id is the public share token, carrying document capabilities, an optional origin allowlist, an optional scrypt-hashed passphrase, a session TTL, and an optional expiry. Editing or deleting a grant retargets every embedded copy of its token at the next exchange.
- Serves the public `POST /v1/share-sessions` exchange, which validates origin, passphrase, expiry, disablement, and tenant suspension before minting a document session JWT. Unknown, revoked, disabled, and suspended grants answer alike so the existence of a grant is never disclosed, and the route carries its own per-IP and per-grant limiters rather than the authentication-failure budget.
- Enforces an optional `origins` claim on document tokens for every request that arrives with a browser `Origin` header, covering both share sessions and backend-minted tokens. Requests without the header are governed by the token itself.
- Adds CORS through `CLOUDPDF_CORS_ORIGINS` (`*` to reflect, or a comma-separated allowlist), which browser-direct deployments need. Bearer tokens remain the security boundary; per-credential origin locks carry the origin policy a server-wide list cannot express.
- Records per-tenant usage facts for views, uploads, and stored bytes, readable at `GET /v1/tenants/:tenantId/usage`. A view is a share exchange or an authorized `/v1/access` grant, counted once across the two. These counters hold no limits and are separate from license metering.
- Adds `tenants.suspend` and `tenants.resume`, which fail every tenant JWT, document JWT, and share exchange closed while leaving the root API token free to inspect, resume, or delete the tenant.
- Mounts token revocation from the CLI through `CLOUDPDF_ENABLE_REVOCATION`.
- Records share and suspension lifecycle events in the security-event trail, and adds matching SQLite and PostgreSQL migrations plus origin, passphrase, and end-to-end share coverage.
