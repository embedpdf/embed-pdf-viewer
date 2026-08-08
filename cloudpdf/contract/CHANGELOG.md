# @cloudpdf/contract

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
