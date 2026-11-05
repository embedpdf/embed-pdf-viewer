---
'@embedpdf/engine-core': minor
---

Every point in time on the wire is an ISO 8601 string: an access's `expiresAt` and its CDN's `cdn.expiresAt` (`DocumentAccessInfo`, `CdnAccessInfo`, `AccessResponseSchema`), a layer version's `createdAt`, and a prepared signature's `expiresAt` (now typed `IsoDateTimeSchema`). They were Unix seconds, and a layer version's milliseconds.
