---
'@embedpdf/plugin-commands': minor
---

A resolved command says whether it's a toggle: `pressable` is true when the command has an `active` of its own or opens a panel, and false for a command that runs an action, opens a menu or opens a dialog. A toggle's button says `aria-pressed`, true or false, and other buttons leave it off, so a screen reader announces only toggles as toggles. `resolvedCommandsEqual` compares it too, and an unregistered command isn't one.
