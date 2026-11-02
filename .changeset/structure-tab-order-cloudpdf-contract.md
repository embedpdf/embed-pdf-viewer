---
'@cloudpdf/contract': minor
---

Every annotation has `structurePosition`: where it sits in the document's tags, as the index of each step from the structure tree's root down, or `null` when it isn't tagged. Only the engine writes it: a draft or a patch may carry it, as a read returns it, and the engine keeps its own.
