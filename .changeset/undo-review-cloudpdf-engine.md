---
'@cloudpdf/engine': patch
---

Another session's outline edits, and its undos of annotation deletes, move this session's cached pins, so it never reads the old outline or annotations from a cached URL. Every remote event kind is named where they are absorbed, so a new one can't be forgotten.
