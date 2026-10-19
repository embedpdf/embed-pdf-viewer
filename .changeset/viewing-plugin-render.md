---
'@embedpdf/plugin-render': minor
---

The render settings are live: `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged`, over `RENDER_DEFAULTS` (`fullPage`, `tiles`, `format`, `quality`, `debug`), for every open document. A new budget, tile size or format applies at once: pages re-plan and redraw. `RenderConfig` is now `DeepPartial<RenderSettings>`.

`renderPage`, `renderThumbnail`, `renderPages` and `getRenderEpoch` take a page's ref or its index, and so does `invalidate({ pages })`, which skips a page that isn't in the document; `getRenderEpoch` reads such a page as `0`. `renderPages` reports a failed page as it was given, and `renderPage`, `renderThumbnail` and `renderPages` reject `operation-cancelled` as soon as their `signal` fires.
