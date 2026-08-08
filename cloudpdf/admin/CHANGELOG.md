# @cloudpdf/admin

## 3.0.0-next.1

### Major Changes

- [#720](https://github.com/embedpdf/embed-pdf-viewer/pull/720) by [@bobsingor](https://github.com/bobsingor) – Reworks the backend administration SDK around explicit tenant addressing and deployment API-token authentication.
  - Replaces the flat document client with `cloud.tenant(tenantId)`, accepting exactly one root `apiToken` or delegated `tenantToken` credential.
  - Adds tenant lifecycle APIs for creating, listing, iterating, retrieving, and deleting tenants.
  - Adds tenant token APIs for issuing document or tenant JWTs and revoking them by `jti`.
  - Adds keyset-paginated document listing, lifecycle-state filtering, and an async document iterator.
  - Moves the SDK's shared schemas and route definitions to `@cloudpdf/contract`.

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt Node.js administration SDK for CloudPDF. It lets trusted backends upload and manage documents, inspect deployment state, and mint scoped viewer tokens without exposing administrative credentials to the browser.
