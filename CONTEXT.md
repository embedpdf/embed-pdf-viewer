# EmbedPDF — Context

EmbedPDF is a framework-agnostic, MIT-licensed PDF viewer monorepo. The core is rendered by Preact, but every framework-bound package publishes parallel adapters so consumers stay in their idiom.

## Glossary

### Snippet

The all-in-one viewer published as `@embedpdf/snippet`. It bundles every plugin and a polished UI behind the `<embedpdf-container>` Web Component, isolated by Shadow DOM and configured by a flat `PDFViewerConfig`. Consumers normally reach the Snippet through a per-framework wrapper.

### Wrapper viewer

A thin per-framework package under `viewers/<framework>` (e.g. `@embedpdf/react-pdf-viewer`, `@embedpdf/vue-pdf-viewer`, `@embedpdf/svelte-pdf-viewer`) that wraps the Snippet's Web Component as a native component for that framework. Its only job is to render a host element, call `EmbedPDF.init({ type: 'container', target, ...config })`, expose the container and registry promise through framework idioms (refs / `expose` / dispatch), and clean up on unmount. **Not** a re-implementation of the viewer.

### Headless bindings

The per-framework subpath exports (`@embedpdf/core/<framework>`, `@embedpdf/engines/<framework>`, every `@embedpdf/plugin-*/<framework>`) that expose framework-idiomatic primitives — Provider component (`<EmbedPDF engine plugins>`), engine bootstrap hook (`usePdfiumEngine`), registry/plugin/capability hooks (`useRegistry`, `usePlugin`, `useCapability`), and layer components (`Viewport`, `Scroller`, `RenderLayer`, …). They let consumers assemble custom UIs without using the Snippet.

### Plugin Registry

Created by `new PluginRegistry(engine, config)`, registered with a `PluginBatchRegistrations` array, and resolved via `pluginsReady()`. The registry is the single object handed out to consumers (and to the Web Component's `.registry` promise) — every per-plugin capability is reached through `registry.getPlugin<T>(id).provides()`.

### Capability vs. Plugin

A **plugin** is the registered package; its `provides()` returns the **capability** — a public, framework-neutral object with the imperative API (e.g. `ZoomCapability.zoomIn()`, `ScrollCapability.scrollTo()`). Headless hooks (`useCapability<ZoomPlugin>(ZoomPlugin.id)`) are thin reactive wrappers around `provides()`.

### Scope

A capability narrowed to a specific document, returned by `capability.forDocument(documentId)`. State subscriptions (`scope.onStateChange`) and per-document operations always go through a Scope. Hooks like `useZoom(documentId)` resolve a Scope under the hood.

### `@framework` virtual import

Build-time alias used inside `src/shared/` so the same source can be compiled for React or Preact. The `@embedpdf/build` Vite preset rewrites `@framework` and `@embedpdf/core/@framework` to the concrete adapter for each per-framework Vite mode. Vue and Svelte do **not** share via `@framework` — their reactivity primitives diverge enough that they ship dedicated `src/vue/` and `src/svelte/` trees.

### Angular integration (planned)

Will follow the same two-tier shape: a Wrapper viewer at `viewers/angular` (`@embedpdf/angular-pdf-viewer`) plus per-package `/angular` Headless bindings on `@embedpdf/core`, `@embedpdf/engines`, and every plugin.

- **Peer range**: `@angular/core >=21.0.0`. Signals + zoneless are baseline; `input()/output()/model()` are used unconditionally.
- **Builder**: a fifth mode (`'angular'`) added to `@embedpdf/build`'s `defineLibrary()`, using [`@analogjs/vite-plugin-angular`](https://analogjs.org/docs/guides/libraries). Outputs ESM + CJS into `dist/angular/` alongside the existing `dist/<react|preact|vue|svelte>/` outputs. AOT-compiled FESM2022, **not** partial-Ivy APF — fine for Angular 21+ consumers; documented as a caveat for anyone expecting ng-packagr semantics.
- **Registry context**: dual surface. `provideEmbedPdf({ engine, plugins, config })` returns Angular providers (idiomatic, scoped to route or app via `Route.providers`); `<embedpdf-provider>` standalone component is a thin secondary alternative for inline scoping. Both establish the same `PluginRegistry` token consumed by `injectXxx` helpers.
- **Helper naming**: `injectXxx()` injection-context functions across the board — `injectRegistry()`, `injectPlugin(ZoomPlugin.id)`, `injectCapability<ZoomPlugin>(ZoomPlugin.id)`, per-plugin `injectZoom(documentId)`, `injectScroll(documentId)`, etc. Returns `Signal<T>` for state. Consumers needing observables call `toObservable()` from `@angular/core/rxjs-interop` themselves; we do not ship a parallel observable surface.
- **Selectors / class names**: brand prefix `embedpdf-`. Wrapper selector `embedpdf-viewer` (class `PdfViewer`). Headless layer selectors `embedpdf-viewport`, `embedpdf-scroller`, `embedpdf-render-layer`, `embedpdf-annotation-layer`, ... (classes `Viewport`, `Scroller`, `RenderLayer`, `AnnotationLayer`, ...). No `Component`/`Directive`/`Service` class suffixes — Angular 2025 style guide.
- **SSR posture**: Wrapper viewer and headless layer mount via `afterNextRender()` so all browser-API touches (engine + WASM + Web Component upgrade) happen on the client only. Server platform renders an empty host element; no hydration mismatch.
- **Forms (post-v1)**: `@embedpdf/plugin-form/angular` is **not in v1**. When it ships (v1.x+), it depends on `@angular/forms` (peer ≥21) and `injectForm(documentId, { schema? })` returns a Signal Forms `FormTree` whose model is auto-derived from the PDF's discovered AcroForm fields and bidirectionally synced with `FormCapability`. API surface stays experimental until Angular v22 stabilizes Signal Forms.
- **v1.0 plugin scope**: 15 headless packages — `@embedpdf/{core,engines}` plus `plugin-{document-manager,viewport,scroll,render,tiling,interaction-manager,zoom,pan,rotate,selection,search,spread,thumbnail}`. Annotation, redaction, signature, form, attachment, bookmark, capture, commands, export, fullscreen, history, i18n, print, stamp, ui, ai-manager, layout-analysis, view-manager defer to v1.x / v2.x.
- **v1.0 rollout order** (derived from Svelte composition tree at `examples/svelte-tailwind/src/routes/viewer-simple/+page.svelte`):
  - **Phase A — Foundation**: `@embedpdf/build` `'angular'` mode; `@embedpdf/core/angular`; `@embedpdf/engines/angular`. Three packages, no useful UI yet.
  - **Phase B — Minimum viable render** (tracer bullet for "first PDF on screen"): `plugin-{document-manager,viewport,scroll,render,tiling,interaction-manager}/angular`. After this phase a consumer can render a PDF with no toolbar.
  - **Phase C — Useful features**: `plugin-{zoom,pan,rotate,selection,search,spread,thumbnail}/angular`. Parallelisable; each plugin is mechanical once Phase A+B are stable.
  - **Phase D — Headless proof-of-life**: `examples/angular-custom` — floating Adobe-style toolbar over the headless viewer using only Phase A–C plugins. Acts as both demo and end-to-end test.
  - **Phase E — Battery-included viewer**: `viewers/angular` → `@embedpdf/angular-pdf-viewer`. Wraps the snippet's Web Component (which already ships every plugin baked in) — *not* subject to the v1.0 plugin scope.
  - **Phase F — Onboarding ergonomics**: `ng add` schematic.
  - **Phase G — Documentation**: `website/docs/angular/*` mirroring `/docs/react/*` (setup → headless introduction → layers → plugin pages → recipes).
- **v1.x deliverables** (after v1.0 lands): `examples/angular-{tailwind,material}`; per-package `/angular` for the deferred ~17 plugins.
- **Branch strategy**: long-running integration branch `feature/angular` on `the-ult/embed-pdf-viewer`. All Phase A–G implementation PRs target `feature/angular`. When v1.0 is complete (Phases A–G all merged into `feature/angular`), open a single upstream PR `the-ult:feature/angular` → `embedpdf:main`.

Other decisions in flight; see `docs/adr/` once published.
