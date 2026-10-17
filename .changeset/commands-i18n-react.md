---
'@embedpdf/react': minor
---

`@embedpdf/react/commands` exports `standardCommands`, `useCommandsSettings()` and `formatShortcut()`, and `useCommand(id)` gives a bound `run` and a `shortcut` formatted for the platform. `useCommandShortcuts()` leaves a key alone when its command can't run, so the browser's own shortcut still works. `@embedpdf/react/i18n` has `useI18nState()` (`{ locale, direction, locales, loading }`) and `useI18nSettings()`; `useLocale()` is gone. `@embedpdf/react/runtime` exports `epdfTheme({ accent, … })`, a theme written with setting names as a style. `@embedpdf/react/toolbar` exports the toolbar's vocabulary only (the shortcut helpers moved to `/commands`), its default parts take their colors from `--epdf-toolbar-*`, the default button shows the command's label, and a render prop that returns `undefined` leaves the part to the default.
