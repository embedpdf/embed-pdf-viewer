---
'@embedpdf/plugin-history': minor
---

The history plugin ships undo and redo as commands, `historyCommands`: `history:undo` (`Mod+Z`) and `history:redo` (`Mod+Shift+Z`, `Mod+Y`). They come from a new `@embedpdf/plugin-history/commands` entry and from the package root, and are part of each framework package's `standardCommands`. They stay disabled while there is nothing to undo or redo. The entry reads the plugin through its contract, so the list brings no plugin code with it.
