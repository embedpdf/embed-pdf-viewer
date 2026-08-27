---
'@cloudpdf/server': patch
---

Reusing an explicit `docId` on `documents.init` or `documents.import` now answers a clean `409 Conflict` explaining how to proceed (retry with the same `idempotencyKey` to resume, delete the document to replace it, or use a different/omitted `docId`) instead of surfacing the raw database unique-constraint error as a 500 — including the case where a retry mints a fresh idempotency key per attempt. A `docId` already owned by another tenant answers `403`, mirroring the existing delete semantics.
