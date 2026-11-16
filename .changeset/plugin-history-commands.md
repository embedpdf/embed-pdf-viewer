---
'@embedpdf/plugin-history': minor
---

The history plugin ships undo and redo as commands: `createHistoryCommands()` makes the list of `history:undo` (`Mod+Z`) and `history:redo` (`Mod+Shift+Z`, `Mod+Y`). It comes from a new `@embedpdf/plugin-history/commands` entry. They stay disabled while there is nothing to undo or redo. The entry reads the plugin through its contract, so the list brings no plugin code with it. Each framework package has the list ready as `historyCommands`, and it is part of `standardCommands`.
