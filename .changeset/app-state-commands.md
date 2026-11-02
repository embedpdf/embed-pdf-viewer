---
'@embedpdf/plugin-commands': minor
---

Commands read your app's state. The new `appState` setting is what every command's functions get as `appState` (values, and functions that change them); a new value replaces the old one whole and every command's `enabled`, `active` and `visible` are asked again. After a command runs, every command is asked again too, so a button whose `run` changed state outside the viewer shows it at once. `CommandDef<AppState>`, `CommandContext<AppState>` and `commandsPlugin<AppState>()` type it; a command's functions are methods, so a typed command goes wherever a command does.
