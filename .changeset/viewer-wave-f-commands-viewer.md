---
'@embedpdf/viewer': minor
---

Commands and shortcuts, as Buttons & commands describes them: a command of yours with its own `label`, whose functions get `get` (a plugin by its name), the `viewer` and the `documentId`; a command with a built-in id that changes only the fields it gives; your shortcut winning over a built-in one with the same keys; icons as `{ paths, fill }`, and a built-in icon replaced by yours of the same name. Keyboard shortcuts reach a viewer only while focus is inside it, and a press on the pages puts it there; `?` opens the shortcuts sheet, Ctrl/Cmd+F opens search, Ctrl/Cmd+O opens a file, Ctrl/Cmd+S downloads and Delete removes the selected annotations. New built-in commands: `page:next`, `page:previous`, `page:first`, `page:last`, `page:go-to`, `selection:highlight`, `selection:underline`, `selection:strikeout` and `redaction:apply`, and `tool:<id>` for a tool of your own. The `CommandContext`, `IconName` and `IconPaths` types are exported.
