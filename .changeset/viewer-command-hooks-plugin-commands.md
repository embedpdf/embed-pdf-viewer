---
'@embedpdf/plugin-commands': minor
---

`unregisteredCommand(id)`, what a component or a toolbar draws for an id no plugin registered, is neither visible nor enabled, the way a turned-off command is. `unknownCommandWarning(id, known)` is the development warning for it, with the closest id there is. `resolveCommand(id)` still says `null` for an unknown id.
