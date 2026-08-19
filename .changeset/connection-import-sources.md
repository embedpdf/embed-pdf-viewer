---
'@cloudpdf/contract': minor
'@cloudpdf/server': minor
---

`documents.import` gains the provider-neutral `connection` source kind: requests name an operator-registered connection plus a key (and an opaque, provider-interpreted `revision`), so provider details never enter the public wire contract. Connections are configured via the `CLOUDPDF_IMPORT_CONNECTIONS` env registry (v1 provider: S3 and S3-compatibles) with boot-validated, fail-closed authorization: per-connection credential classes (default: api-token only), tenant allowlists, and a scope union — whole-bucket (api-token only, structurally), shared prefixes, or a `tenants/{tenantId}/` template that binds the authenticated tenant to its own slice at any tenant count. Self-imports are refused via a canonical backend fingerprint (AWS namespace vs custom endpoints). Every import now upserts a structured provenance row in the new `document_imports` table (migration 026): source identity, requested/resolved revision, credential class, actor, attempts, and sanitized outcome — the same table phase 3b's async worker will drive. A shared import-source conformance suite pins the URL and S3 adapters to identical open() semantics.
