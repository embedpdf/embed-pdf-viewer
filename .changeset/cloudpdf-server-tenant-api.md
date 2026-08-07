---
'@cloudpdf/server': major
---

Adds the tenant-scoped backend API and root API-token workflow to the self-hosted CloudPDF server.

- Replaces the legacy flat admin routes with contract-backed `/v1/tenants/:tenantId` document, tenant, token, and deployment operations.
- Adds constant-time root API-token authentication alongside delegated tenant JWT authorization.
- Adds tenant lifecycle and provenance tracking, keyset pagination and state filtering, and cascade deletion for tenant-owned data.
- Adds document and tenant token issuance, revocation, and durable security-event auditing.
- Allows API tokens on document-plane routes and supports per-request `X-Document-Password` authorization through HMAC proofs or non-mutating checks against the canonical PDFium session, including credential-safe open singleflight behavior.
- Adds matching SQLite and PostgreSQL migrations plus expanded registry, authorization, password, and end-to-end coverage.
