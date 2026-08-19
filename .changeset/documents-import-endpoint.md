---
'@cloudpdf/contract': minor
'@cloudpdf/server': minor
---

New `documents.import` operation: a server-side pull that fetches a PDF from a caller-supplied URL (e.g. a presigned S3/GCS/Azure/R2 GET) into CloudPDF-owned storage, verifies it, and commits it through the existing lifecycle — synchronous and bounded by a deployment import policy (`CLOUDPDF_IMPORT_*`: size cap, timeout, concurrency, https-only and public-network-only by default, with SSRF hardening: private/metadata address vetting with DNS pinning, no redirects, required Content-Length). Optional `expected.sizeBytes`/`expected.sha256` pins are enforced when declared; otherwise the server-observed SHA-256 is authoritative. Terminal failures mark the document failed with sanitized reasons (presigned query strings never leak); transport failures return 502 and leave the row pending so retrying with the same `idempotencyKey` resumes the same document. `upload_kind` gains a `'pull'` variant (migration 025).
