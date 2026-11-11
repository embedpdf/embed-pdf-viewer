---
'@embedpdf/plugin-annotation': minor
---

New `duplicate(refs, { page?, offset?, select? })` copies annotations in the same document. The copies show at once, it is one step to undo, labelled `annotation.duplicate`, and it resolves `{ annotations, dropped }`. A stamp keeps its drawing and an attachment its file, with nothing to download, and an annotation keeps its link. `selection.duplicate({ offset? })` copies the selection 10 points right and down, or left or up near the page's edge, and selects the copies. `canDuplicate(refs)` and `selection.canDuplicate()` are false without the right to create and for a locked annotation, whose copy would be locked too; code can still copy one. `isMovable(ref)` says whether an annotation is one people move: false for one that sits on text, such as a highlight.
