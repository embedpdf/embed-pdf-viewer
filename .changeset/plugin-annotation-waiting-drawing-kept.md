---
'@embedpdf/plugin-annotation': patch
---

A pen or highlighter drawing is no longer lost when something else happens right after a stroke. After a stroke the pen waits a moment for the next stroke of the same drawing. Pressing another annotation in that moment dropped the stroke, and so did starting a marquee selection, opening a text box for typing, deleting the selection, and creating a markup from code. Now the stroke becomes an annotation first, and a press selects only what it hit. Fixes #1062.

Picking another tool during that wait keeps the tool you picked: with `afterCreate.tool: 'default'` the viewer went back to the default tool instead. `finishInkDraft()` on the host capability now leaves a stroke that is still being drawn alone.
