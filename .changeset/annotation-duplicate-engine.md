---
'@embedpdf/engine': minor
---

The local engine has `doc.annotations.copy(refs, { page?, offset?, objectNumbers? })`: copies of annotations in the same document, as one change that one undo takes away. In a change of your own it is the op `annotations.copy`.
