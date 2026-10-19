---
'@embedpdf/angular': minor
---

Your app's UI in Angular: commands, the toolbar, panels and translations.

- `@embedpdf/angular/commands`: `withCommands({ commands })`, `standardCommands`, and
  `inject(EpdfCommands)` with the plugin's methods, `executed$`, the settings, and
  `commandOf(id)`, one command as a signal. `<button [epdfCommand]="'zoom:in'">` runs a command
  on click and keeps the button's `disabled`, `aria-pressed`, `title` and `hidden` in step; its
  template reference (`#zoomIn="epdfCommand"`) has `label()`, `icon()`, `shortcut()`, `enabled()`
  and `active()`. Keyboard shortcuts: `withCommandShortcuts()` for the whole page, or
  `epdfCommandShortcuts` on the element around one viewer. `formatShortcut()` shows a shortcut
  for the platform.
- `@embedpdf/angular/toolbar`: `<epdf-toolbar [bar]>` fits itself to its width (items get
  smaller, groups fold, the rest goes into a "More" menu) and takes every part as a template:
  `epdfToolbarCommand`, `epdfToolbarCustom="name"`, `epdfToolbarCollapsed`,
  `epdfToolbarGroupTrigger`, `epdfToolbarSeparator`, `epdfToolbarOverflowTrigger` and
  `epdfToolbarOverflowMenu`, each with a plain default. The bar's vocabulary (`group()`,
  `item()`, `custom()`, `addItem()`, …) is exported with it.
- `@embedpdf/angular/shell`: `withShell()` and `inject(EpdfShell)`, with `openSurfaces()` and
  `openMenus()` as signals, the events as streams, and `shell.surface('comments')`: `isOpen()`,
  `props()`, `open()`, `close()` and `toggle()`, closed and doing nothing until a document is
  open. `<button epdfPanelToggle="comments" epdfPanelToggleExclusive="right">` toggles a panel
  and sets `aria-expanded`.
- `@embedpdf/angular/i18n`: `withI18n(options)`, `inject(EpdfI18n)` with `locale()`,
  `direction()`, `locales()`, `loading()` and `translator()` as signals, and the `epdfT` pipe:
  `{{ 'toolbar.save' | epdfT }}`, `{{ 'search.results' | epdfT: { params: { count } } }}`.
