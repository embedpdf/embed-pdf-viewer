---
'@embedpdf/plugin-annotation': patch
---

A pen or highlighter stroke is no longer lost when another annotation is pressed right after drawing it. After a stroke the pen waits a moment for the next stroke of the same drawing, and a press on an annotation in that moment dropped the stroke. Now the stroke becomes an annotation first, and the pressed annotation is selected. The same holds when a marquee selection starts in that moment, or a text box is opened for typing. Fixes #1062.
