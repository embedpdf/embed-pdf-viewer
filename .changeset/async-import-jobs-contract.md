---
'@cloudpdf/contract': minor
---

Extend `documents.importFrom` with `mode: "async"`. Async requests accept operator-registered connection sources and return 202 with `tag: "accepted"` and a pending document that callers can poll with `GET /documents/:id`; presigned URL sources remain synchronous.
