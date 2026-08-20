---
'@cloudpdf/server': minor
---

Add operator-registered import connections through `CLOUDPDF_IMPORT_CONNECTIONS` for S3 and S3-compatible stores, GCS, Azure Blob, and filesystem roots. Connections enforce credential classes, tenant allowlists, scoped prefixes or tenant-bound key templates, provider-specific revision pinning, and fail-closed authorization. Canonical backend fingerprints reject self-imports, and each import records sanitized source provenance and outcome in the new `document_imports` table from migration 026. A shared conformance suite keeps URL and connection adapters aligned on source-opening behavior.
