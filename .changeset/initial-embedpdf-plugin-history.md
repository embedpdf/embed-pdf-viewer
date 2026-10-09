---
'@embedpdf/plugin-history': major
---

Introduces `@embedpdf/plugin-history`: undo and redo, one history per open document, of what this session changes through the viewer's plugins. `historyPlugin()` records every change the plugins stage on the document's change queue as it is staged, so an undo right after an action undoes it even while it is still on its way to the engine; the document shows it undone at once, and the engine undoes the change by reference. Typing into one text box is one step. `undo()`, `redo()`, `canUndo()`, `canRedo()`, `getUndoLabel()`, `getRedoLabel()` (`{ key: 'annotation.move', count: 3 }`), `clear()`, `historyState`, and the events `onUndone` (with how many parts someone else changed since, `skipped`) and `onUndoFailed` (`'unavailable'` or `'refused'`). A refused change leaves the history; a refused undo puts its step back; a redaction, flattening, signing, form repair or a new version clears it. The `limit` setting (default 100) caps the steps.
