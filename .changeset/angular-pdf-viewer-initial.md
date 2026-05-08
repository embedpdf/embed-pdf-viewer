---
'@embedpdf/angular-pdf-viewer': minor
---

Initial release of `@embedpdf/angular-pdf-viewer`. Provides an Angular 21+ standalone `PDFViewer` component that wraps `@embedpdf/snippet`, mirroring the contract of the existing Vue/React/Svelte wrapper viewers (signal-based `config` input, `init`/`ready` outputs, `OnPush` change detection). Uses `@analogjs/vite-plugin-angular` for AOT-compiled FESM2022 output following Analog's library-build guidance.
