---
'@embedpdf/plugin-commands': patch
---

A command's `enabled`, `active`, `visible`, `labelParams`, `iconAccent`, `allowed` and `locked` are
asked once per store change, however many toolbars, menus and strips show the command, and its
label and disabled reason are translated again only when one of their answers changed. Scrolling
and zooming a long document no longer spends a fifth of its time asking every command again.

`resolveCommand` and `listCommands` follow every change the viewer knows of: the viewer's own
state, your app's state given through `appState`, and a command that ran. `execute` and
`canExecute` ask the command at the moment they're called, so a run never goes by an answer that
something outside the viewer changed since.
