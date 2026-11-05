---
'@cloudpdf/sdk': minor
---

Every point in time is an ISO 8601 date-time string, where `createdAt`, `updatedAt`, the other `…At` fields and every `expiresAt` were numbers in milliseconds or seconds. A token revoke takes `expiresAt` instead of `expiresAtSeconds`.
