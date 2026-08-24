---
'@cloudpdf/contract': minor
---

Add the `documents.importFrom` operation for importing a PDF from a caller-supplied URL. The request supports optional size and SHA-256 integrity pins, metadata, deduplication, and idempotency fields, while responses distinguish completed imports from validation, authorization, conflict, and upstream transport failures.
