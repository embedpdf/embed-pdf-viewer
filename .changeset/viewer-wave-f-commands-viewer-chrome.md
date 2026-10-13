---
'@embedpdf/viewer-chrome': minor
---

Commands and shortcuts, as Buttons & commands describes them:

- A command in `commands` shows its own `label`, and its functions get `get`, which takes a plugin's name (`get('selection')`) or its token, the `viewer` (the one `onReady` gets) and the `documentId`. `CommandDef` and `CommandContext` are the viewer's own types for them.
- A command with a built-in id merges over the built-in command: what it leaves out stays, so `{ id: 'document:download', run }` keeps Download's label, icon, shortcut and checks. That holds for the `panel:<id>` and `mode:<id>` commands the layout brings too.
- A shortcut of yours takes its keys from every built-in command that has them, so the key runs your command and the built-in one's tooltip no longer shows it.
- Keyboard shortcuts reach a viewer only while focus is inside it, or in one of your components slotted into it, so two viewers on a page never both take a key and the page keeps its own keys everywhere else. A press on the pages puts focus inside the viewer.
- `?` opens a sheet with every shortcut, in groups, in the viewer's language (`help:shortcuts`). Ctrl/Cmd+F opens the search panel, Ctrl/Cmd+O opens a file, Ctrl/Cmd+S downloads, and Delete or Backspace removes the selected annotations.
- New built-in commands: `page:next`, `page:previous`, `page:first`, `page:last` and `page:go-to` (with `args: { page }`, else a Go to Page dialog), `selection:highlight`, `selection:underline` and `selection:strikeout` (in the bar over selected text), and `redaction:apply` (which asks first). A tool of yours in `plugins.annotation.tools` gets its `tool:<id>` command, labelled and drawn from its `meta` or the tool it extends.
- The built-in commands ask the plugins' `can*` checks whether the session may run them, instead of naming scope permissions.
- An icon in `icons` is a path, a list of paths, or `{ paths, fill: true }` to fill them; one with a built-in icon's name replaces it everywhere, the armed tool's cursor included. `IconName` names the viewer's own icons.
