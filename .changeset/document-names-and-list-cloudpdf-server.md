---
'@cloudpdf/server': minor
---

Store a name for every document, searchable and sortable without regard to
case, and rename documents with `PATCH /v1/tenants/:tenantId/documents/:id`
under the new `docs.update` scope. The documents list searches by name, sorts
by creation time, name or size in either order with stable cursors, and hides
documents that are being deleted unless asked for by state. Migration 045 names
existing documents from `metadata.name` when it is a non-empty string, otherwise
from their id.
