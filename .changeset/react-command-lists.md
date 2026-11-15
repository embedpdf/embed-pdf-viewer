---
'@embedpdf/react': minor
---

Each feature entry exports its plugin's commands as a list: `stageCommands` from `/stage`, `interactionCommands` from `/interaction`, `selectionCommands` from `/selection`, `annotationCommands` from `/annotation`, `historyCommands` from `/history`, `renderCommands` from `/render` and `documentCommands` from `/runtime`. `standardCommands` is these lists joined. To leave some commands out, spread the lists you want in place of `standardCommands`.

`standardCommands` gains `history:undo` (`Mod+Z`) and `history:redo` (`Mod+Shift+Z`, `Mod+Y`), from the history plugin's list. They run the history plugin's undo and redo, and stay disabled without `historyPlugin()` or while there is nothing to undo or redo. A command of your own with one of these ids still replaces the standard one when it comes after `...standardCommands` in the `commands` setting of `commandsPlugin()`. With the standard commands in use, `registerCommand()` with one of these ids now needs `{ replace: true }`.
