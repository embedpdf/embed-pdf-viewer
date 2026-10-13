---
'@embedpdf/plugin-commands': minor
---

A command's `panel` takes `focus`: `panel: { id: 'search', focus: true }` opens the panel asking for the cursor, as `shell.open(id, { focus: true })` does. `shortcutInTextFields: true` lets a command's shortcut run while the cursor is in a text field where the shortcuts listen (a Find that should work from the search box too); `matchStroke(stroke, { isMac, inTextField })` then matches only such commands.
