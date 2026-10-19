---
'@embedpdf/plugin-annotation': minor
---

Undo and redo with `@embedpdf/plugin-history`:

- The selection follows them: an undo selects what was selected before the change, as far as it still shows, and a redo what was selected after it.
- Annotations an undo brings back return in their place, with the picture they had, before the engine answers; a page an undo returns to how it was a moment ago asks the engine for nothing.
- The pauses of one typing session into a text box are one step.
