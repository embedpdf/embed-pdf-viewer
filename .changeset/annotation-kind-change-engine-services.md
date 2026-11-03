---
'@embedpdf/engine-services': minor
---

An update with a sibling `subtype` writes the annotation as its new kind: its `/Subtype`, its fields as the new kind's, and an appearance drawn as one. Undo puts the old kind back, also when the annotation changed since.
