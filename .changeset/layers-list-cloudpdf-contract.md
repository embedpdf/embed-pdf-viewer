---
'@cloudpdf/contract': minor
---

Add `documents.layers.list` (`GET /v1/tenants/{tenantId}/documents/{id}/layers`, scope `docs.read`): a document's layers that hold changes, newest first, paged like the other tenant lists with `limit`, `cursor` and `nextCursor`. Each record says whose layer it is (`shareId` and `visitorId` for a share-link visitor's own), its `storageSizeBytes`, and when it was made, last changed and last seen. `shareId` filters to one link's visitors, a deleted link's too. A layer appears at its first change, and a deleted one is not listed.
