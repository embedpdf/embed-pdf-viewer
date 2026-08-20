# @cloudpdf/server

## 3.0.0-next.6

### Minor Changes

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Add durable asynchronous document imports backed by the `document_imports` job table and an in-process worker with one claim loop per replica. Document and job creation is atomic, lease-token-fenced transitions prevent stale workers from overwriting replacements, reconcile-on-claim avoids duplicate transfers after crashes, and exhausted retries fail the document and clean destination bytes. Retries stay pinned to one content identity, filesystem sources require `expected.sha256`, and queued or running imports are protected from the stale-pending sweeper. Migration 027 stores the re-drivable source descriptor in `source_json`.

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Add operator-registered import connections through `CLOUDPDF_IMPORT_CONNECTIONS` for S3 and S3-compatible stores, GCS, Azure Blob, and filesystem roots. Connections enforce credential classes, tenant allowlists, scoped prefixes or tenant-bound key templates, provider-specific revision pinning, and fail-closed authorization. Canonical backend fingerprints reject self-imports, and each import records sanitized source provenance and outcome in the new `document_imports` table from migration 026. A shared conformance suite keeps URL and connection adapters aligned on source-opening behavior.

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Implement server-side PDF imports from caller-supplied URLs through the existing document lifecycle. Deployment policy controls size, timeout, concurrency, HTTPS, and public-network requirements; URL handling blocks private and metadata addresses with DNS pinning, rejects redirects, and requires `Content-Length`. Imports enforce optional size and SHA-256 pins, sanitize failures so URL secrets do not leak, leave documents pending after retryable transport failures, and add the `pull` upload kind in migration 025.

### Patch Changes

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Mount the document import handler under the renamed `documents.importFrom` contract operation and align the server's import policy and lifecycle terminology. The HTTP route and runtime behavior remain unchanged.

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Cloud ObjectStore adapters (S3, GCS, Azure Blob) now truly stream `put` bodies: a `Readable` is hashed and length-enforced as it flows (constant memory) instead of being buffered whole. Under- or over-delivery aborts before a visible object can appear, any prior object at the key survives a failed attempt, and the SHA-256 metadata is attached post-stream (S3 via a same-key server-side copy). FsObjectStore now cleans up its `.partial` file when the source stream errors mid-put.

## 3.0.0-next.5

### Patch Changes

- [#760](https://github.com/embedpdf/embed-pdf-viewer/pull/760) by [@bobsingor](https://github.com/bobsingor) – Keep connected licenses usable during Keygen's three-day `EXPIRING` window by relying on the signed validation decision instead of the informational status label. Licenses whose expiry has elapsed remain denied.

## 3.0.0-next.4

### Patch Changes

- [#750](https://github.com/embedpdf/embed-pdf-viewer/pull/750) by [@bobsingor](https://github.com/bobsingor) – Preserves configured CORS response headers on the hijacked server-sent events stream, allowing browser clients on permitted origins to subscribe to document layer events.

## 3.0.0-next.3

### Minor Changes

- [#748](https://github.com/embedpdf/embed-pdf-viewer/pull/748) by [@bobsingor](https://github.com/bobsingor) – Derives the connected usage-reporting credential from the license key, so a connected deployment is configured with `CLOUDPDF_LICENSE_KEY` alone.
  - Computes the reporting credential as `cpr_v1_` + base64url(HMAC-SHA256) over a domain-separated message that binds the signed `cloudpdfLicenseId` license metadata, so the wire credential is one-way (it can never reveal the license key) and never authenticates another license record.
  - Retires `CLOUDPDF_LICENSE_REPORTING_TOKEN`. A deployment that still sets it boots normally; the variable is ignored and the server logs a warning asking for its removal.
  - Existing connected deployments upgrade by removing the retired variable. During the coordinated verifier cutover on the CloudPDF side a usage report may answer 401; reports retry every five minutes with cumulative counters, so no usage is lost and license validation is unaffected.
  - Air-gapped deployments are unchanged and continue to send no telemetry.
  - Pins fixed cross-runtime derivation test vectors shared with the CloudPDF control plane.

- [#746](https://github.com/embedpdf/embed-pdf-viewer/pull/746) by [@bobsingor](https://github.com/bobsingor) – Fixes presigned-upload materialization and makes commit-time sha verification single-read and constant-memory.
  - Fixes the range materializer crashing with `EBADF` whenever an object carried no SHA metadata — the shape of every presigned browser upload. The failure was silent: commits still reached `ready` while the security probe recorded `unknown` and thumbnail warming recorded `failed`. The hash fallback now closes the write-only handle and streams the finished partial from disk, guards against short positional writes, and rejects a metadata/expected-sha disagreement before paying for the download.
  - Replaces the S3 and FS `getSha256` fallbacks that buffered whole objects in RAM with streaming hashes — constant memory regardless of document size.
  - Commit now verifies uploaded bytes with a single object-store read when a base-file cache is wired (`DocumentLifecycleOptions.fileCache`): the upload is materialized into the cache, hashed on the way down, and reused by the security probe instead of being downloaded a second time. `LocalFileHandle.sourceKey` reports which object key materialized a content-addressed entry, so a cross-key cache hit still triggers a direct verification of the committing document's own object.
  - Adds a typed `ShaMismatchError` (exported) thrown by all `materializeLocal` implementations, letting callers distinguish declared-hash mismatches from retryable transport failures.
  - Surfaces previously swallowed failures: `DocumentSecurityProbeOptions.onError`, `DerivedRenderServiceOptions.onWarmError`, and base-file-cache `materialize-error` events are now wired to the server log.

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
