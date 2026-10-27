---
'@cloudpdf/server': minor
---

Delete a layer with `DELETE /v1/tenants/{tenantId}/documents/{id}/layers/{layerName}`. Its artifacts, renders, change captures, changes, audit rows, signings, password sessions and object numbers go, and its worker session closes. A layer that was written keeps its row as a tombstone (migration 037), and every route then answers its name with `LayerDeleted` (HTTP 410), because its read URLs were cached as immutable and a new layer under the name would restart at the same versions. A layer nobody wrote leaves no tombstone and stays usable. A write in flight on another replica loses its commit to the delete. Deleting a layer a share link uses is refused with 409, and a share link can't be created for a deleted layer.
