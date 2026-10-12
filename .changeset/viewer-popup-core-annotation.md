---
'@embedpdf/core-annotation': patch
---

A popup annotation (`/Subtype /Popup`, the window a comment's text shows in) is never painted on the page or hit there: it joins replies and review states on the conversation plane, which the comments UI draws, as Acrobat draws its own window and ignores a popup's appearance. One without an appearance was drawn as a grey box from its rect, which producers put in the page's margin or past its edge. An annotation type the viewer doesn't model is drawn only from its appearance, as its kind said: without one it draws nothing, instead of a box.
