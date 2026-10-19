---
'@embedpdf/angular': minor
---

The adapter is set up and used the Angular way.

- `provideEmbedPdf(config, ...features)` replaces `<epdf-viewer>`. It works in a component's
  `providers` (and that component can inject the viewer's services), a route's, or the app
  config. Plugins are features: `withStage()`, `withRender()`, `withInteraction()`,
  `withFeedback()`, in place of `stagePlugin()` arrays. `engine` may be a function that returns
  a promise (`() => import('@embedpdf/engine').then((m) => m.localEngine())`); the config also
  takes `identity`, `scope`, `accent` and `page`.
- One service per plugin, in place of the `inject*()` functions: `inject(EpdfDocuments)`,
  `inject(EpdfDocument)` (with `pages()`), `inject(EpdfRender)`, `inject(EpdfInteraction)` (with
  `overrideCursor()`), `inject(EpdfViewer)` (`settings()`, `updateSettings()`, `status()`). Each
  has the plugin's methods, its State values as signals, its events as RxJS streams
  (`openFailed$`), and its settings. Under `[epdfDocumentScope]` they act on that document.
  `pluginService()` builds a plugin's service.
- `<epdf-stage #stage="epdfStage">` is the Stage's API: every method, its State as signals
  (`zoomLevel()`, `currentPageIndex()`, `activeRules()`), `settings()`, `scrollMetrics()`, and
  streams (`pageChanged$`, `cameraChanged$`). New: `[(page)]`, `[(zoom)]`, and `[document]`,
  which opens a document for the Stage and follows the value. `injectZoom()`, `injectPages()`,
  `injectLayout()`, `injectStageSettings()` and `[epdfStageScope]` are removed.
- `*epdfDocumentGate="let document; fallback: opening; locked: locked; error: failed"`: the
  ready document as context, and templates for a document waiting for its password and one that
  failed to open.
- New: `<epdf-scrollbar>`, `<epdf-anchored>`, the render layer's sharp tiles when zoomed in,
  `epdfTheme()`, `saveFile()` and `mountWebFont()`.
- Setup mistakes are numbered errors with the fix and a link: `EPDF-101` to `EPDF-105`.
