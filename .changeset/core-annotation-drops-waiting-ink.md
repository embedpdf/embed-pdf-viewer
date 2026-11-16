---
'@embedpdf/core-annotation': minor
---

`dropsWaitingInk(before, after, message)` says whether a message took the place of an ink drawing that waited in the draft for its next stroke (a pen stroke held back with `deferInkCommit`). A host that runs `update` itself uses it to make the strokes an annotation with `finishInkDraft` first, and then run the message again.
