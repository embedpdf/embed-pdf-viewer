---
'@cloudpdf/contract': minor
---

Share links can be archived: `shares.archive` (`POST /v1/tenants/{tenantId}/shares/{shareId}/archive`) ends a link for good while keeping what its visitors made, and the record carries `archivedAt`. `shares.list` leaves archived links out unless asked with `archived=true`. `shares.delete` deletes only a link whose visitors made no changes and answers 409 otherwise, and `shares.update` answers 409 for an archived link.
