---
'@cloudpdf/server': minor
---

List a document's layers with `GET /v1/tenants/{tenantId}/documents/{id}/layers`: newest first, cursor-paged like documents, tenants and shares, optionally only one share link's visitors' layers (`shareId`). This is how a link's owner finds what visitors filled in and downloads it through the layer's routes. Migration 040 replaces the per-document layer index with one in list order.
