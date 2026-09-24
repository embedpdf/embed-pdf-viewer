---
'@embedpdf/viewer-chrome': minor
'@embedpdf/react': patch
---

Backspace and Delete now delete the current selection. The default chrome's `annotation:delete` command is bound to both keys, so shapes, free text, ink/signatures, stamps, form widgets, and pending redactions are all removed with the keyboard (they are all annotations, and the command already cascades widgets through the form plane). The keymap ignores strokes from inputs, textareas, and contenteditable, so typing is unaffected, and `useCommandShortcuts` now only calls `preventDefault()` when the matched command is visible and enabled — a key that is also a browser verb keeps its native behavior when the command cannot run.
