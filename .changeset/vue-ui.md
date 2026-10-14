---
'@embedpdf/vue': minor
---

Add the entry points for your app's own UI: `commands`, `toolbar`, `shell` and `i18n`.

- `@embedpdf/vue/commands`: `standardCommands`, `useCommands()`, `useCommandsEvent()`, `useCommandsSettings()` and `formatShortcut()`. `useCommand(id)` is a command as a button needs it, as a ref (its label, icon, state, `run` for the component's document and its formatted `shortcut`), and takes a getter for an id that changes. `useCommandShortcuts()` turns every shortcut into a working key while the component lives, or only while focus is inside `target`, a template ref.
- `@embedpdf/vue/toolbar`: `<Toolbar :bar>` fits a bar into the width it has (labels become icons, groups fold, the rest goes into a "More" menu) and you draw every part through its slots: `#command`, `#custom` (your own items, by `name`), `#collapsed`, `#group-trigger`, `#separator`, `#overflow-trigger` and `#overflow-menu`, each with a plain default. A slot that draws nothing for a part leaves it to the default. `useStripView(bar)` is a bar's visible commands as a ref, for a strip that doesn't fit itself; the schema helpers (`group`, `item`, `custom`, …) come from the same import.
- `@embedpdf/vue/shell`: `useShell()`, `useShellState()`, `useShellEvent()`, and `useSurface(id)`, one panel's `isOpen` and `props` as refs with its `open`, `close` and `toggle`; closed, with verbs that do nothing, while no document is open.
- `@embedpdf/vue/i18n`: `useI18n()`, `useI18nState()`, `useI18nSettings()`, `useI18nEvent()`, and `useT()`, a translate function that reads the language reactively, so a template or a computed that calls it updates when the language changes.
