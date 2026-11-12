---
'@embedpdf/engine': patch
---

`localEngine()` starts under a dev server that prebundles packages without their files: Vite 7 and older, which includes `ng serve` in Angular 20 and 21. The engine's worker URL pointed into the dev server's cache folder, where nothing is, so the document never opened. There the engine now starts from `blob:` workers and a copy of the WebAssembly that only a dev build carries (`@embedpdf/engine/dev-wasm`). A production build is unchanged. An engine that cannot start now also says so in the console, with the URL it tried.
