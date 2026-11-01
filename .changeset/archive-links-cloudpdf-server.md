---
'@cloudpdf/server': minor
---

Archive share links instead of losing what their visitors made. Archiving (migration 041) stops a link's exchange for good, like a revoke, but keeps the link and its visitors' layers, still listed with `documents.layers.list?shareId=` and downloadable. Deleting a link is refused with 409 while its visitors have layers; one whose visitors only looked can still be deleted. An archived link refuses updates, is left out of `shares.list` unless `archived=true`, and no longer keeps its shared layer from being deleted. Its visitors' layers keep to the link's idle setting.
