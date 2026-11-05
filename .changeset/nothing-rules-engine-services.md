---
'@embedpdf/engine-services': patch
---

A stamping import still puts an item in no group in the caller's group, now that an annotation create's `groupId: null` asks for no group.
