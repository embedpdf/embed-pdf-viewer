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
- **Registry context**: dual surface. `provideEmbedPdf({ engine, plugins, config })` returns Angular providers (idiomatic, scoped to route or app via `Route.providers`) — accepts engine **config** (`{wasmUrl, worker, fontFallback}`); `<embedpdf-provider [engine]="instance" [plugins]="...">` is a standalone component for inline scoping — accepts an already-created `PdfEngine` **instance**. Both register a single internal `EMBEDPDF_CONTEXT` `InjectionToken` (never exported) consumed by every `injectXxx()` helper. Two-registry detection: any scope that would create a second `EMBEDPDF_CONTEXT` while one is in an ancestor scope throws `EmbedpdfDuplicateRegistryError` synchronously at factory/constructor time. Legitimate "engine shared, registry per child" pattern (root `provideEmbedPdfEngine` + multiple `provideEmbedPdf({plugins})` children) is allowed because the root only registers `PDF_ENGINE_TOKEN`, not the registry context.
- **Bootstrap timing**: every provider defers engine creation, WASM fetch, `new PluginRegistry`, and store subscription wiring to `afterNextRender`. SSR-clean by construction: server platform never fires `afterNextRender`, signals stay null, consumers render their loading branches. See ADR 0003.
- **Bridge primitives** (`bridgeScopeState`, `bridgeCoreSignal`): the two shared adapter utilities exported from `@embedpdf/core/angular` that every per-plugin `injectXxx(documentId)` hook is built on. `bridgeScopeState(pluginId, documentId: Signal<string>, initialState)` returns `{state, provides, isLoading}` — uses `effect((onCleanup) => ...)` to bridge `scope.onStateChange` (imperative) into a signal. `bridgeCoreSignal(selector)` returns `Signal<T | null>` — pure `computed()`. Every plugin's hook becomes a single mechanical call to one of these; no hand-written subscription code per plugin.
- **Helper naming**: `injectXxx()` injection-context functions across the board — `injectRegistry()`, `injectPlugin(ZoomPlugin.id)`, `injectCapability<ZoomPlugin>(ZoomPlugin.id)`, per-plugin `injectZoom(documentId)`, `injectScroll(documentId)`, etc. Returns `Signal<T>` for state. Consumers needing observables call `toObservable()` from `@angular/core/rxjs-interop` themselves; we do not ship a parallel observable surface.
- **Selectors / class names**: brand prefix `embedpdf-`. Wrapper selector `embedpdf-viewer` with class `PDFViewer` — the wrapper class is the single explicit exception to the Angular ALLCAPS-in-identifiers rule, kept uppercase for cross-framework symmetry with `@embedpdf/{react,vue,svelte}-pdf-viewer`. Headless layer selectors `embedpdf-viewport`, `embedpdf-scroller`, `embedpdf-render-layer`, ... (classes `Viewport`, `Scroller`, `RenderLayer`, ...). Engine and core types keep their existing `Pdf` casing (`PdfEngine`, `PdfiumEngine`). No `Component`/`Directive`/`Service` class suffixes — Angular 2025 style guide.
- **SSR posture**: Wrapper viewer and headless layer mount via `afterNextRender()` so all browser-API touches (engine + WASM + Web Component upgrade) happen on the client only. Server platform renders an empty host element; no hydration mismatch.
- **Forms (post-v1)**: `@embedpdf/plugin-form/angular` is **not in v1**. When it ships (v1.2), it depends on `@angular/forms` (peer ≥21) and `injectForm(documentId, { schema? })` returns a Signal Forms `FormTree` whose model is auto-derived from the PDF's discovered AcroForm fields and bidirectionally synced with `FormCapability`. Signal Forms is production-ready in Angular 21+, so no version block.
- **v1.0 plugin scope**: read-only viewing only. 19 headless packages — `@embedpdf/{core,engines}` plus `plugin-{document-manager,viewport,scroll,render,tiling,interaction-manager,zoom,pan,rotate,selection,search,spread,thumbnail,fullscreen,i18n,print,export}`. Anything that creates content, edits, or tracks edits is out: annotation, redaction, signature, form, stamp, plugin-ui (schema-driven), history, capture, attachment, bookmark, ai-manager, layout-analysis, view-manager, commands defer to v1.x / v2.x. The Wrapper viewer (`@embedpdf/angular-pdf-viewer`) is **not** subject to this scope — it wraps the Snippet's Web Component which bakes in every plugin internally, so drop-in consumers get the full feature set on day one.
- **v1.0 rollout order** (derived from Svelte composition tree at `examples/svelte-tailwind/src/routes/viewer-simple/+page.svelte`):
  - **Phase A — Foundation**: `@embedpdf/build` `'angular'` mode; `@embedpdf/core/angular`; `@embedpdf/engines/angular`. Three packages, no useful UI yet.
  - **Phase B — Minimum viable render** (tracer bullet for "first PDF on screen"): `plugin-{document-manager,viewport,scroll,render,tiling,interaction-manager}/angular`. After this phase a consumer can render a PDF with no toolbar.
  - **Phase C — Useful features** (11 plugins): `plugin-{zoom,pan,rotate,selection,search,spread,thumbnail,fullscreen,i18n,print,export}/angular`. Parallelisable; each plugin is mechanical once Phase A+B are stable.
  - **Phase D — Headless proof-of-life**: `examples/angular-custom` — floating Adobe-style toolbar over the headless viewer using only Phase A–C plugins. Acts as both demo and end-to-end test.
  - **Phase E — Battery-included viewer**: `viewers/angular` → `@embedpdf/angular-pdf-viewer`. Wraps the snippet's Web Component (which already ships every plugin baked in) — *not* subject to the v1.0 plugin scope. Mechanically depends only on Phase A's build mode (and bug #27 fix); may ship in parallel with B–D rather than after them.
  - **Phase F — Onboarding ergonomics**: `ng add` schematic. Two flows: drop-in (`ng add @embedpdf/angular-pdf-viewer`) only adds the WASM glob to `angular.json`; headless (`ng add @embedpdf/angular-pdf-viewer --headless`) additionally inserts `provideEmbedPdf({...})` into `app.config.ts`.
  - **Phase G — Documentation**: `website/docs/angular/*` mirroring `/docs/react/*` (setup → headless introduction → layers → plugin pages → recipes).
- **v1.x deliverables** (after v1.0 lands): `examples/angular-{tailwind,material}`; per-package `/angular` for the 13 deferred plugins. Tentative ordering — v1.1: `plugin-{annotation,redaction,signature,stamp,plugin-ui}` (the editing surface, Angular Signal Forms-friendly); v1.2: `plugin-{form,bookmark,attachment,history,capture,commands}` (Forms ↔ Signal Forms bridge — Signal Forms is production-ready in Angular 21+, no version block); v2.0: `plugin-{ai-manager,layout-analysis,view-manager}`.
- **Testing posture**: Vitest is the chosen test runner — root `vitest.workspace.ts` glues per-package configs. Hooks/utilities run as Node-mode unit tests; standalone components and directives run under Vitest browser mode (chromium) via `@analogjs/vitest-angular`, which pairs with the existing AnalogJS Vite plugin in `@embedpdf/build`. The repo has dormant `*.test.ts` files in `packages/models/src/` written before any test runner was wired in; the new A0 issue covers wiring `pnpm test` + a `test` task in `turbo.json` + a CI workflow that runs it, and verifying the dormant tests still pass (fix as part of A0 if not). No Playwright in v1.0 — vitest browser-mode component tests cover the "real Angular runtime against real DOM" gap; the Phase D example app exists for manual demo, not e2e gating. CI gating: Node-mode tests run on every PR; browser-mode tests path-filtered to PRs touching `packages/*/src/angular/**`, `viewers/angular/**`, or `examples/angular-custom/**`.
- **Branch strategy**: long-running integration branch `feature/angular` on `the-ult/embed-pdf-viewer`. All Phase A–G implementation PRs target `feature/angular`. When v1.0 is complete (Phases A–G all merged into `feature/angular`), open a single upstream PR `the-ult:feature/angular` → `embedpdf:main`.

Other decisions in flight; see `docs/adr/` once published.
