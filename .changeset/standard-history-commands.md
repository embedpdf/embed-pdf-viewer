---
'@embedpdf/plugin-commands': minor
---

The standard commands gain `history:undo` (`Mod+Z`) and `history:redo` (`Mod+Shift+Z`, `Mod+Y`). They run the history plugin's undo and redo, and stay disabled without `historyPlugin()` or while there is nothing to undo or redo. A command of your own with one of these ids still replaces the standard one when it comes after `...standardCommands` in the `commands` setting. With the standard commands in use, `registerCommand()` with one of these ids now needs `{ replace: true }`.
