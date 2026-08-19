---
'@cloudpdf/contract': minor
---

Rename the contract operation from `documents.import` to `documents.importFrom` so generated Java, Python, and Ruby SDKs expose a consistent method name. The HTTP path remains `POST /v1/tenants/{tenantId}/documents/import`. The OpenAPI emitter now rejects group or method segments that collide with reserved words in those target languages.
