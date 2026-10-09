---
'@embedpdf/core-annotation': minor
---

A callout's selection frame is everything it paints: its box, its line and the ending at its tip, the same box as its `rect`. A selected callout is grabbed on its line or anywhere in that frame, a multi-selection box takes in its line, and a move keeps the whole callout on the page. A selected annotation is now grabbed in its frame or anywhere a click would hit it, so selecting never shrinks where it can be grabbed. An attached link on a text box covers only its box. `isOnTextBox(record, point, margin, view?)` says whether a point is on a text box's own box, where its text is.
