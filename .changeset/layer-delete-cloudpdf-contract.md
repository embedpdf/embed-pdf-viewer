---
'@cloudpdf/contract': minor
---

Add `documents.layers.delete` (`DELETE /v1/tenants/{tenantId}/documents/{id}/layers/{layerName}`, scope `docs.delete`): delete a layer and everything it stored, for example a user's data. A layer that was written can't be used again under its name; one nobody wrote stays usable. A layer a share link uses is refused with 409 until the link is deleted.
