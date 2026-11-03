---
'@embedpdf/plugin-annotation': minor
---

`selection.update({ subtype })` changes each selected annotation that can become that kind, as the same annotation, and the rest keep theirs. `selection.getProperties()` leads with a `subtype` choice when the selection's kinds are siblings that can change kind (not a replacement's strikeout), offering the kinds people may change by hand.
