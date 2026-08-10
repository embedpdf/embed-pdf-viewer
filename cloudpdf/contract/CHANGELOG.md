# @cloudpdf/contract

## 3.0.0-next.2

### Minor Changes

- [#730](https://github.com/embedpdf/embed-pdf-viewer/pull/730) by [@bobsingor](https://github.com/bobsingor) – Adds the share-grant contract: standing, revocable authorization decisions that let a document be embedded with no backend.
  - Defines `shares.create`, `shares.list`, `shares.get`, `shares.update`, and `shares.delete` under `/v1/tenants/:tenantId/shares`, governed by the new `shares.manage` tenant scope.
  - Defines `shares.exchange` at `POST /v1/share-sessions`, the contract's only unauthenticated operation: the grant row is the authorization, so a public share token trades for a short-lived document session JWT. The registry test now pins that surface, making any future credential-less operation an explicit decision.
  - Adds an optional `origins` allowlist to document-token issuance, so a minted token can be restricted to named web origins.
  - Adds `tenants.usage` for per-tenant usage facts, plus `tenants.suspend` and `tenants.resume` for operator-controlled tenant suspension.
  - Reports tenant `status` on tenant records and regenerates `openapi.json`, which now carries 44 operations.

- [#734](https://github.com/embedpdf/embed-pdf-viewer/pull/734) by [@bobsingor](https://github.com/bobsingor) – Adds the integrity-pinned `init → transfer → commit` document upload protocol,
  including presigned PUT and policy-controlled multipart proxy transfer modes.

## 3.0.0-next.1

### Major Changes

- [#720](https://github.com/embedpdf/embed-pdf-viewer/pull/720) by [@bobsingor](https://github.com/bobsingor) – Introduces the complete CloudPDF backend HTTP contract, replacing the narrower `@cloudpdf/admin-api` package.
  - Defines a typed operation registry and Zod request/response schemas for tenant administration, document lifecycle, token delegation, deployment status, and backend-callable document-plane operations.
  - Exposes tenant-aware route builders and operation metadata shared by the admin SDK and server.
  - Adds an OpenAPI 3.1 emitter, a packaged `openapi` entry point, and the generated `openapi.json` artifact.
  - Validates operation IDs, route coverage, schema references, security declarations, and generated OpenAPI output with contract tests.

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the shared CloudPDF administration contract package. It provides the HTTP route definitions and Zod schemas used by both `@cloudpdf/admin` and `@cloudpdf/server` so client and server stay wire-compatible.
