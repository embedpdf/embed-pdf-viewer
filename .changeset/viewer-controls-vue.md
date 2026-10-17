---
'@embedpdf/vue': minor
---

`useCommandShortcuts({ onRefused })` reports a key whose command is turned off or not allowed, with why; the key no longer reaches the browser. `<SelectionClipboard>` emits `refused` when Ctrl/Cmd+C or the browser's Copy meets a selection the user may not copy.

The toolbar entry exports the bar vocabulary only: `ChromeSchema`, `FrameSchema`, `MenuSchema`, `MenuSection`, `chromeHelpers`, `defineChrome`, `validateChrome`, `addItem`, `removeItems` and `replaceItem` are gone with the chrome schema they edited. `custom(name)` without a command makes an item that never leaves the bar.
