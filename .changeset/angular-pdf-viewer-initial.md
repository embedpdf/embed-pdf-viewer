---
'@embedpdf/angular-pdf-viewer': minor
---

Initial release of `@embedpdf/angular-pdf-viewer`. Provides an Angular 22+ standalone `PDFViewer` component (selector `<embedpdf-viewer>`) that wraps `@embedpdf/snippet`, mirroring the contract of the existing Vue/React/Svelte wrapper viewers:

- Signal-based `config` input
- Signal-based outputs: `(init)`, `(ready)`, `(themeChange)` (forwards the snippet's `themechange` custom event)
- Reactive state signals: `container: Signal<EmbedPdfContainer | null>`, `registry: Signal<PluginRegistry | null>`
- `OnPush` change detection, SSR-safe `afterNextRender` mounting, `DestroyRef` cleanup
- `provideEmbedPdfViewerConfig({ ... })` + `EMBEDPDF_VIEWER_DEFAULT_CONFIG` token for app/route/component-scoped default config that merges with per-instance `[config]` (via `mergeViewerConfigs` deep-merge rules)

Built via `@analogjs/vite-plugin-angular` for AOT-compiled FESM2022 output following Analog's library-build guidance.
