# @cloudpdf/server

## 3.0.0-next.2

### Minor Changes

- [#730](https://github.com/embedpdf/embed-pdf-viewer/pull/730) by [@bobsingor](https://github.com/bobsingor) – Implements share grants, origin locking, per-tenant usage, and tenant suspension.
  - Stores share grants whose row id is the public share token, carrying document capabilities, an optional origin allowlist, an optional scrypt-hashed passphrase, a session TTL, and an optional expiry. Editing or deleting a grant retargets every embedded copy of its token at the next exchange.
  - Serves the public `POST /v1/share-sessions` exchange, which validates origin, passphrase, expiry, disablement, and tenant suspension before minting a document session JWT. Unknown, revoked, disabled, and suspended grants answer alike so the existence of a grant is never disclosed, and the route carries its own per-IP and per-grant limiters rather than the authentication-failure budget.
  - Enforces an optional `origins` claim on document tokens for every request that arrives with a browser `Origin` header, covering both share sessions and backend-minted tokens. Requests without the header are governed by the token itself.
  - Adds CORS through `CLOUDPDF_CORS_ORIGINS` (`*` to reflect, or a comma-separated allowlist), which browser-direct deployments need. Bearer tokens remain the security boundary; per-credential origin locks carry the origin policy a server-wide list cannot express.
  - Records per-tenant usage facts for views, uploads, and stored bytes, readable at `GET /v1/tenants/:tenantId/usage`. A view is a share exchange or an authorized `/v1/access` grant, counted once across the two. These counters hold no limits and are separate from license metering.
  - Adds `tenants.suspend` and `tenants.resume`, which fail every tenant JWT, document JWT, and share exchange closed while leaving the root API token free to inspect, resume, or delete the tenant.
  - Mounts token revocation from the CLI through `CLOUDPDF_ENABLE_REVOCATION`.
  - Records share and suspension lifecycle events in the security-event trail, and adds matching SQLite and PostgreSQL migrations plus origin, passphrase, and end-to-end share coverage.

- [#734](https://github.com/embedpdf/embed-pdf-viewer/pull/734) by [@bobsingor](https://github.com/bobsingor) – Adds integrity-pinned uploads with presigned storage transfer preferred and a
  policy-controlled multipart proxy fallback.

  Hardens filesystem-backed storage against path traversal, storage-root deletion,
  and recursive deletion through symbolic links.

## 3.0.0-next.1

### Major Changes

- [#720](https://github.com/embedpdf/embed-pdf-viewer/pull/720) by [@bobsingor](https://github.com/bobsingor) – Adds the tenant-scoped backend API and root API-token workflow to the self-hosted CloudPDF server.
  - Replaces the legacy flat admin routes with contract-backed `/v1/tenants/:tenantId` document, tenant, token, and deployment operations.
  - Adds constant-time root API-token authentication alongside delegated tenant JWT authorization.
  - Adds tenant lifecycle and provenance tracking, keyset pagination and state filtering, and cascade deletion for tenant-owned data.
  - Adds document and tenant token issuance, revocation, and durable security-event auditing.
  - Allows API tokens on document-plane routes and supports per-request `X-Document-Password` authorization through HMAC proofs or non-mutating checks against the canonical PDFium session, including credential-safe open singleflight behavior.
  - Adds matching SQLite and PostgreSQL migrations plus expanded registry, authorization, password, and end-to-end coverage.

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the self-hostable CloudPDF document server. The Fastify service combines authentication, durable storage, native PDF processing, realtime document events, and commercial license enforcement behind the Engine v3 HTTP API.
