---
'@cloudpdf/contract': minor
---

Every point in time is an ISO 8601 string (`format: date-time`): `createdAt`, `updatedAt`, `archivedAt`, `lastExchangedAt`, `firstSeenAt`, `lastSeenAt` and `consentedAt` on tenants, documents, folders, grants, layers and visitors, and every `expiresAt` (grants, the upload URL, tokens, grant sessions, download links), which were milliseconds in some places and seconds in others. A request gives one with its offset: a grant's `expiresAt`, and a token revoke's `expiresAt`, which replaces `expiresAtSeconds`. A date a write takes as a `Date` in process is a date-time string in `openapi.json`. A schema a model reuses no longer takes the `nullable` of the field that used it first: a grant's `createdAt` and `updatedAt`, and a visitor's `firstSeenAt` and `lastSeenAt`, read as non-null.
