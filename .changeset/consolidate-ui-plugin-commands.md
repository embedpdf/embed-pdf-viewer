---
'@embedpdf/plugin-commands': patch
---

Add `boundCommandOf(command, execute, { isMac })`, a resolved command with `run` and its first shortcut formatted for the platform (the `BoundCommand` type moves here from the framework adapters, unchanged), and `unregisteredCommand(id)`, what a toolbar draws for an id no plugin registered.
