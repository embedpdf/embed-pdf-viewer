---
'@embedpdf/plugin-form': patch
---

A widget whose box has no size shows nowhere, and is now treated that way. This is how a PDF keeps an invisible signature and the field of a document timestamp. Tab no longer stops at it, `focus()` answers `false` for its field, it gets no fill control, and in design mode it is not lent to the annotation tools, so a click or a marquee can no longer select it.
