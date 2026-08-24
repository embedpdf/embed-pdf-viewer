---
'@cloudpdf/contract': major
---

Introduces the complete CloudPDF backend HTTP contract, replacing the narrower `@cloudpdf/admin-api` package.

- Defines a typed operation registry and Zod request/response schemas for tenant administration, document lifecycle, token delegation, deployment status, and backend-callable document-plane operations.
- Exposes tenant-aware route builders and operation metadata shared by the admin SDK and server.
- Adds an OpenAPI 3.1 emitter, a packaged `openapi` entry point, and the generated `openapi.json` artifact.
- Validates operation IDs, route coverage, schema references, security declarations, and generated OpenAPI output with contract tests.
