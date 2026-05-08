# PRD — Angular integration (v1.0)

> **Status**: Draft, ready for upstream discussion
> **Date**: 2026-05-08 (revised: phasing reordered — headless first, Wrapper viewer second)
> **Domain context**: [`CONTEXT.md`](../../CONTEXT.md)
> **Related ADRs**:
> - [0001 — Angular packages publish via AnalogJS Vite, not ng-packagr](../adr/0001-angular-publishing-via-analogjs-vite.md)
> - [0002 — Angular Headless registry context: provider primary, component secondary](../adr/0002-angular-headless-registry-via-provider-function.md)

## Problem Statement

Angular developers cannot consume EmbedPDF the way React, Vue, and Svelte developers can. Today they have three options, all bad:

1. Use `<embedpdf-container>` directly with `CUSTOM_ELEMENTS_SCHEMA`. Works, but loses TypeScript safety on the config object, has no Signals integration, can't participate in Angular Forms, and feels nothing like Angular code.
2. Wrap a React component inside an Angular shell with one of the React-in-Angular adapters. High overhead, ships React + Preact in the bundle, no zoneless support.
3. Re-implement the viewer from scratch on top of `@embedpdf/core` directly. Requires deep knowledge of the plugin architecture and only the boldest teams attempt it.

A senior Angular developer evaluating PDF libraries today picks `ngx-extended-pdf-viewer` or a commercial product because there is no first-party EmbedPDF integration that respects Angular 21 idioms (signals, zoneless, standalone, `provideXxx`, modern style guide).

## Solution

Ship a two-tier Angular integration that mirrors the React/Vue/Svelte pattern *plus* takes advantage of Angular-specific primitives. **Build the Headless layer first** so all the customisation power is available from day one, then layer the battery-included Wrapper viewer on top. UI-library examples (Material, Tailwind) follow once the foundation is stable.

- **Headless layer** — per-package `/angular` subpath exports across `@embedpdf/core`, `@embedpdf/engines`, and 13 plugins. Angular consumers configure the registry via `provideEmbedPdf({ engine, plugins })` at app or route scope (idiomatic Angular, like `provideRouter`), then read state via `injectXxx()` injection-context functions returning Signals. Layer components like `<embedpdf-viewport>`, `<embedpdf-scroller>`, `<embedpdf-render-layer>` slot into custom layouts. A `<ng-template embedpdfPage let-page>` directive carries the per-page render context (Angular's idiomatic translation of Svelte's `renderPage` snippet / React's render-prop).
- **Headless proof-of-life example** — `examples/angular-custom` exercises the headless layer end-to-end with a floating Adobe-style vertical toolbar over the viewer (zoom, pan, rotate, search, thumbnail toggle, fullscreen).
- **Wrapper viewer (`@embedpdf/angular-pdf-viewer`)** — a single standalone component, `<embedpdf-viewer>`, that drops into any Angular 21 app and renders the full snippet with theme/icon/i18n/plugin support already wired in. One import, one tag, one `config` input. Same shape as `<PDFViewer>` in React/Vue/Svelte; same 30-line getting-started.
- **Schematic** — `ng add @embedpdf/angular-pdf-viewer` wires `provideEmbedPdf()` into `app.config.ts` and copies the PDFium WASM into `angular.json` `assets[]` automatically.
- **Documentation** — `/docs/angular/*` mirrors the React/Vue/Svelte sections of the existing docs site.

Angular consumers get the same "works in 60 seconds" Wrapper story as React/Vue/Svelte, and Angular shops that want a custom UI get a Signals-native, zoneless-clean, route-scopable headless API that reads like idiomatic Angular 21 code.

## User Stories

### Headless layer — registry & engine bootstrap (Phase A)

1. As an Angular architect, I want to call `provideEmbedPdf({ engine, plugins })` inside a route's `providers` array, so that the engine and registry live for the route's lifetime and don't tear down on intra-route navigation.
2. As an Angular architect, I want to bootstrap the engine and the plugin registry in a single provider call, so that the common case stays one line.
3. As an Angular architect, I want to call `provideEmbedPdfEngine({...})` separately for advanced cases where one engine instance is shared across multiple registries, so that I can render multiple PDFs with separate plugin sets without re-downloading WASM.
4. As an Angular developer, I want a `<embedpdf-provider [engine] [plugins]>` standalone component as an alternative to the provider function, so that I can scope two viewers within the same component template (one engine each).
5. As an Angular developer, the `<embedpdf-provider>` component should detect a registry already in scope and refuse to create a duplicate, so that I can't accidentally double-bootstrap and waste a worker.
6. As an Angular developer, I want `injectPdfiumEngine({ wasmUrl, worker, fontFallback })` to return signals for engine, isLoading, and error, so that my UI can render loading and error states directly from the template.
7. As an Angular developer, I want the engine to default to a CDN-hosted WASM URL, so that the zero-config path Just Works.
8. As an Angular developer, I want to override the WASM URL via the engine config, so that I can self-host the WASM file for offline / corporate-firewall scenarios.
9. As an Angular SSR developer, I want all browser-API touches (engine creation, WASM fetch, `customElements` lookup) deferred to `afterNextRender`, so that server rendering doesn't crash on missing browser globals.
10. As an Angular Universal user, I want the server-rendered HTML to include only the host element (empty), so that hydration doesn't mismatch and there's no flash of duplicated content.

### Headless layer — capabilities & state (Phase A continued)

11. As an Angular developer, I want `injectRegistry()` to return a `Signal<PluginRegistry | null>`, so that I can derive computed values that wait for the registry to resolve.
12. As an Angular developer, I want `injectPlugin<T>(id)` returning the plugin instance as a signal, so that I can access plugin internals without a manual `await registry.pluginsReady()`.
13. As an Angular developer, I want `injectCapability<T>(id)` returning the capability as a signal, so that I can call its imperative methods from event handlers and reactively render derived state.
14. As an Angular developer, I want `injectActiveDocument()` and `injectDocumentStates()` from core returning signals over the open documents, so that I can render a tab bar without subscribing manually.
15. As an Angular developer, I want all helpers to return `Signal<T>` and not `Observable<T>`, so that I can treat my code as zoneless-by-default.
16. As an Angular developer comfortable with RxJS, I want documentation showing how to convert any helper signal to an Observable via `toObservable()` from `@angular/core/rxjs-interop`, so that I can integrate with my existing RxJS-heavy code without library duplication.
17. As an Angular developer, I want the helpers named `injectXxx` rather than `useXxx`, so that the API reads like Angular code and pairs with the existing `inject()` muscle memory.

### Headless layer — minimum viable render (Phase B — tracer bullet)

18. As an Angular developer following the getting-started guide, I want to register `DocumentManager`, `Viewport`, `Scroll`, `Render`, `Tiling`, and `InteractionManager` plugins and see a PDF render in my app, so that the tracer bullet works end-to-end before I add any chrome.
19. As an Angular developer, I want `<embedpdf-document-content [documentId]>` as a per-document loading-state wrapper that exposes `isLoading`, `isError`, `isLoaded` signals via template context, so that I can render loading skeletons and password prompts using `@if` / `@switch` blocks.
20. As an Angular developer, I want `<embedpdf-viewport [documentId]>` with content projection as the scrollable host, so that I can apply my own classes/styles and project the scroller inside.
21. As an Angular developer, I want `<embedpdf-scroller [documentId]>` to virtualize page layout and expose a `*embedpdfPage="let page"` template directive, so that I render each visible page through a typed template context (`page.pageIndex`, `page.rotatedWidth`, `page.rotatedHeight`, `page.elevated`).
22. As an Angular developer, I want strict template type-checking on the `*embedpdfPage` context via `ngTemplateContextGuard`, so that the compiler catches typos in my `let-pageIndex` bindings.
23. As an Angular developer, I want `<embedpdf-render-layer [documentId] [pageIndex] [scale]>` to render a page's PDFium output to a canvas, so that I have a baseline rasterised page.
24. As an Angular developer, I want `<embedpdf-tiling-layer [documentId] [pageIndex]>` to overlay high-resolution tiles for the visible viewport, so that zoomed pages stay sharp without re-rendering the whole page.
25. As an Angular developer, I want `<embedpdf-global-pointer-provider [documentId]>` and `<embedpdf-page-pointer-provider [documentId] [pageIndex]>` as scope wrappers, so that interaction-manager-aware children (zoom, pan, capture, selection) receive pointer events.

### Headless layer — useful features (Phase C)

26. As an Angular developer, I want `injectZoom(documentId)` returning `{ state, provides }` as signals, so that I can wire `+`, `−`, fit-page, fit-width buttons in my own toolbar.
27. As an Angular developer, I want `<embedpdf-marquee-zoom [documentId] [pageIndex]>` for drag-to-zoom-region UX inside a page pointer provider.
28. As an Angular developer, I want `injectPan(documentId)` so that I can implement a "hand tool" toggle.
29. As an Angular developer, I want `injectRotate(documentId)` and `<embedpdf-rotate [documentId] [pageIndex]>` so that I can rotate a page (the wrapper component) and read current rotation as a signal (the helper).
30. As an Angular developer, I want `injectSelection(documentId)` plus `<embedpdf-selection-layer [documentId] [pageIndex]>` projecting a selection-menu template, so that I can show context menus over a text selection with my own button styles.
31. As an Angular developer, I want `injectSearch(documentId)` returning current matches and active match index as signals, so that I can render a custom search panel with `@for (match of matches(); track $index)`.
32. As an Angular developer, I want `<embedpdf-search-layer [documentId] [pageIndex]>` overlaying highlights on matched text inside a page.
33. As an Angular developer, I want `injectSpread(documentId)` so that I can offer single/double/cover spread modes.
34. As an Angular developer, I want `injectThumbnail(documentId)` returning a signal over the thumbnail strip data, so that I can render thumbnails in a sidebar with `@for` over the signal.

### Custom-toolbar example (Phase D — proof-of-life)

35. As an Angular developer evaluating EmbedPDF for a custom design system, I want a working example app that demonstrates a floating Adobe-style vertical toolbar over the headless viewer, so that I can copy the integration pattern without importing a UI library.
36. As an Angular developer learning the headless API, I want the example to follow the same composition pattern as the Svelte and React examples (DocumentContent → GlobalPointerProvider → Viewport → Scroller → Rotate → PagePointerProvider → render layers), so that cross-framework documentation is one-to-one.
37. As an Angular developer, I want the toolbar example to include all v1.0 actions (zoom in/out/fit, page nav, rotate, search, thumbnails toggle, fullscreen), so that I see the v1.0 surface in a single screen.
38. As an Angular developer, I want the example to be small enough to read in one sitting (no UI library, single component file plus the toolbar component), so that I can extract patterns into my own app.

### Battery-included viewer (Phase E)

39. As an Angular developer evaluating PDF libraries, I want to install `@embedpdf/angular-pdf-viewer` and render a PDF in under five minutes, so that EmbedPDF beats my time-to-first-render bar before I evaluate features.
40. As an Angular developer, I want to import a single `<embedpdf-viewer>` standalone component, so that I can drop it into any standalone-component app without an NgModule.
41. As an Angular developer, I want to pass the same flat `PDFViewerConfig` object I see in the React/Vue docs, so that cross-framework documentation translates one-to-one.
42. As an Angular developer, I want signal-based outputs for `init`, `ready`, and `themechange`, so that I can react to viewer lifecycle events from a `computed()` or `effect()` without RxJS bridging.
43. As an Angular developer, I want to access the underlying `PluginRegistry` via a signal exposed by the component, so that I can call advanced capability APIs (e.g. fetching metadata) once it resolves.
44. As an Angular SSR developer, I want the viewer to render an empty placeholder on the server and mount the actual viewer in the browser, so that my app boots cleanly under Angular Universal without hydration mismatches.
45. As an Angular developer with strict CSP, I want the Wrapper viewer to document its CSP requirements, so that I can ship a working policy on day one.
46. As an Angular developer, I want the Wrapper viewer to clean up on `ngOnDestroy` so that route changes don't leak workers or WASM memory.

### `ng add` schematic (Phase F)

47. As an Angular developer setting up a new project, I want to run `ng add @embedpdf/angular-pdf-viewer` and have the package installed, so that I don't have to choose npm/pnpm/yarn manually.
48. As an Angular developer, I want the schematic to insert `provideEmbedPdf({...})` into my `app.config.ts` automatically, so that the wrapper component works on the next reload.
49. As an Angular developer, I want the schematic to add the PDFium WASM file to `angular.json` `assets[]`, so that the engine loads from `/assets/pdfium.wasm` without me touching build config.
50. As an Angular developer, I want the schematic to be idempotent (no duplicate inserts on second run), so that re-running it after a `ng update` is safe.
51. As an Angular developer, I want the schematic to prompt before overwriting any existing EmbedPDF configuration, so that I don't lose customisations.

### Documentation (Phase G)

52. As a developer searching for PDF libraries, I want documentation pages at `https://www.embedpdf.com/docs/angular/*` mirroring the React/Vue/Svelte sections, so that the integration is discoverable through the marketing site.
53. As an Angular developer reading the docs, I want the page structure to follow the existing per-framework hierarchy (Setup → Headless Introduction → Plugins → Recipes → Viewer → Custom Examples), so that I learn EmbedPDF the same way React/Vue developers do.
54. As a developer comparing frameworks, I want each Angular code sample to have a "see in React/Vue/Svelte" tab, so that I can immediately see how the same task differs across frameworks.
55. As an EmbedPDF maintainer, I want the docs site to render Angular code samples with proper syntax highlighting (TypeScript + signal-form template syntax + Angular control-flow `@if`/`@for`), so that the examples don't look broken.

### Build, packaging, distribution (cross-cutting)

56. As an EmbedPDF maintainer, I want the Angular packages to build via the existing `@embedpdf/build` `defineLibrary()` pipeline with a new `'angular'` mode, so that I don't have to maintain a second build system.
57. As an EmbedPDF maintainer, I want each Angular subpath (`@embedpdf/core/angular`, etc.) to land in `dist/angular/index.{js,cjs,d.ts}` mirroring the existing `dist/<framework>/` shape, so that the publish flow is identical to React/Vue/Svelte.
58. As an EmbedPDF maintainer, I want each touched package's `exports` map to gain a `"./angular"` entry, so that consumers import via `@embedpdf/<pkg>/angular` per the existing convention.
59. As an Angular consumer, I want each package to declare `peerDependencies: { '@angular/core': '>=21.0.0' }`, so that npm/pnpm warns me at install time if I'm on an older Angular version.
60. As an Angular consumer, I want the published packages to ship as ESM-first FESM2022 with CJS fallback, so that they work in both modern `ng build` and legacy bundlers.
61. As a zoneless Angular consumer, I want all components to use `ChangeDetectionStrategy.OnPush` and signal-based state, so that the integration cooperates with `provideZonelessChangeDetection()` out of the box.

### Forward-compatibility notes (not v1.0)

62. As an Angular developer who'll need annotation/redaction/signature later, I want the v1.0 PRD to declare a stable rollout plan for the remaining plugins, so that I can plan my adoption knowing v1.x will fill the gaps.
63. As an Angular developer interested in PDF AcroForms, I want the eventual `injectForm(documentId, { schema? })` API to integrate with `@angular/forms/signals` (Signal Forms), so that my PDF forms feel like any other form in my app once the package lands in v1.x.
64. As an Angular Material shop, I want an `examples/angular-material` showing the headless layer wrapped in `mat-toolbar` / `mat-sidenav`, so that I can copy a Material design pattern directly.
65. As a Tailwind shop, I want an `examples/angular-tailwind` showing the Wrapper viewer plus a small Tailwind chrome, so that I can see the simplest possible integration.

## Implementation Decisions

### Composition pattern — `embedpdfPage` template directive

The Svelte `Scroller` uses a `Snippet<[PageLayout]>` (`{#snippet renderPage(page)}…{/snippet}`); React uses a render-prop (`renderPage={({pageIndex}) => …}`). Angular's idiomatic translation is a structural directive on `<ng-template>` with a typed context guard:

```ts
interface EmbedpdfPageContext {
  $implicit: PageLayout;  // primary
  page: PageLayout;       // named alias
}

@Directive({ selector: 'ng-template[embedpdfPage]', standalone: true })
class EmbedpdfPageTemplate {
  static ngTemplateContextGuard(_dir: EmbedpdfPageTemplate, ctx: any): ctx is EmbedpdfPageContext {
    return true;
  }
}

// Consumer:
<embedpdf-scroller [documentId]="docId">
  <ng-template embedpdfPage let-page>
    <embedpdf-rotate [documentId]="docId" [pageIndex]="page.pageIndex">
      <embedpdf-page-pointer-provider [documentId]="docId" [pageIndex]="page.pageIndex">
        <embedpdf-render-layer [documentId]="docId" [pageIndex]="page.pageIndex" />
      </embedpdf-page-pointer-provider>
    </embedpdf-rotate>
  </ng-template>
</embedpdf-scroller>
```

The `Scroller` queries the projected `EmbedpdfPageTemplate` via `contentChild(EmbedpdfPageTemplate)` and instantiates one view per visible page using `ViewContainerRef.createEmbeddedView(template, { $implicit: page, page })`. `setLayoutReady(documentId)` fires inside `afterNextRender({ write: () => … })` once all page views are in the DOM.

### Phase ordering (rollout plan)

Sequencing follows the Svelte composition tree's data dependencies — each phase's deliverable is independently usable.

| Phase | Scope | What works at end of phase |
|---|---|---|
| **A — Foundation** | `@embedpdf/build` `'angular'` mode; `@embedpdf/core/angular`; `@embedpdf/engines/angular` | `provideEmbedPdf()` resolves; `injectRegistry/Plugin/Capability` work with a fake plugin in tests. No UI yet. |
| **B — Minimum viable render** | `plugin-{document-manager,viewport,scroll,render,tiling,interaction-manager}/angular` | A consumer can register plugins and see a PDF render. No toolbar, no zoom, no selection. |
| **C — Useful features** | `plugin-{zoom,pan,rotate,selection,search,spread,thumbnail}/angular` | All v1.0 helpers and layer components. Each plugin is parallelisable once Phase A+B are stable. |
| **D — Custom example** | `examples/angular-custom` (floating Adobe-style toolbar) | End-to-end demo with v1.0 features only. Validates the API across all phases. |
| **E — Wrapper viewer** | `viewers/angular` → `@embedpdf/angular-pdf-viewer` | Drop-in `<embedpdf-viewer>` for snippet-style usage. Wraps the existing Web Component; *not* dependent on Phase B–C plugins. |
| **F — Schematic** | `ng add @embedpdf/angular-pdf-viewer` | One-command setup. |
| **G — Documentation** | `website/docs/angular/*` | Public-facing docs. |

### Module 1 — `@embedpdf/build` `'angular'` mode

Extends `defineLibrary()` in the build preset with a fifth case alongside the existing `react`/`preact`/`vue`/`svelte` modes. Inputs per consuming package are `src/angular/index.ts` and `src/angular/tsconfig.angular.json`. Output goes to `dist/angular/index.{js,cjs}` and emits typings via `unplugin-dts`. The mode loads `@analogjs/vite-plugin-angular` and externalizes `@angular/*`, `rxjs`, `tslib`, and the existing `@embedpdf/*` peer pattern. See [ADR 0001](../adr/0001-angular-publishing-via-analogjs-vite.md) for why AnalogJS Vite was picked over ng-packagr.

### Module 2 — `@embedpdf/core/angular` registry context

Exports `provideEmbedPdf()`, `provideEmbedPdfEngine()`, `<embedpdf-provider>`, `injectRegistry()`, `injectPlugin<T>(id)`, `injectCapability<T>(id)`, plus document-state helpers `injectActiveDocument()`, `injectDocumentStates()`, `injectCoreState()`. Both surfaces resolve a single private `InjectionToken<PluginRegistry>` so all `injectXxx` helpers consume the same registry regardless of how it was provided. See [ADR 0002](../adr/0002-angular-headless-registry-via-provider-function.md).

API decisions captured precisely (these are the contract; prose can't carry the type information):

```ts
function provideEmbedPdf(opts: {
  engine?: { wasmUrl?: string; worker?: boolean; fontFallback?: FontFallbackConfig };
  plugins: PluginBatchRegistrations;
  config?: PluginRegistryConfig;
  onInitialized?: (registry: PluginRegistry) => Promise<void>;
}): EnvironmentProviders;

function provideEmbedPdfEngine(opts: {
  wasmUrl?: string; worker?: boolean; fontFallback?: FontFallbackConfig;
}): EnvironmentProviders;

@Component({ selector: 'embedpdf-provider', standalone: true, /* … */ })
class EmbedpdfProvider {
  engine = input<PdfEngine | undefined>();
  plugins = input.required<PluginBatchRegistrations>();
  config = input<PluginRegistryConfig | undefined>();
  init = output<PluginRegistry>();
  ready = output<PluginRegistry>();
}

function injectRegistry(): Signal<PluginRegistry | null>;
function injectPlugin<T extends BasePlugin>(id: T['id']): {
  plugin: Signal<T | null>;
  isLoading: Signal<boolean>;
  ready: Signal<Promise<void>>;
};
function injectCapability<T extends BasePlugin>(id: T['id']): {
  provides: Signal<ReturnType<NonNullable<T['provides']>> | null>;
  isLoading: Signal<boolean>;
  ready: Signal<Promise<void>>;
};
function injectActiveDocument(): Signal<DocumentState | null>;
function injectDocumentStates(): Signal<DocumentState[]>;
```

Internal signal wiring uses `effect()` to subscribe to `registry.getStore().subscribe(...)` and update a `WritableSignal`. Cleanup hooks into `inject(DestroyRef)` so the registry is destroyed when the providing scope tears down. **Crucially the registry lives behind an `InjectionToken`, not a module-level `$state` singleton** — Svelte's approach can't host two viewers in one app; Angular DI scoping fixes this for free.

### Module 3 — `@embedpdf/engines/angular`

Exports `provideEmbedPdfEngine()` (re-exported from core for convenience but defined here) and `injectPdfiumEngine({...})`. The injection function dynamically imports `@embedpdf/engines/pdfium-worker-engine` or `@embedpdf/engines/pdfium-direct-engine` based on the `worker` flag, mirroring the existing Vue/Svelte hooks. Returns `{ engine: Signal<PdfEngine | null>; isLoading: Signal<boolean>; error: Signal<Error | null> }`. Cleanup goes through `DestroyRef` and calls `engine.closeAllDocuments()` then `engine.destroy()`.

### Module 4 — Per-plugin `/angular` adapter pattern

Each of the 13 plugins shipped in v1.0 follows the exact same shape:

- `src/angular/index.ts` re-exports `injectXxx` helpers, layer components, and the base plugin's framework-neutral exports.
- `src/angular/inject-xxx.ts` per plugin: takes `documentId: Signal<string> | string | (() => string)`, returns `{ state: Signal<XxxDocumentState>; provides: Signal<XxxScope | null> }`. State subscription bridge: `effect(() => { … scope.onStateChange(s => writableState.set(s)); … })` with `DestroyRef`-managed cleanup.
- Layer components (`Viewport`, `Scroller`, `RenderLayer`, `TilingLayer`, `SelectionLayer`, `SearchLayer`, `Rotate`, `MarqueeZoom`, etc.) are standalone components mirroring the existing Svelte layer components in `packages/plugin-*/src/svelte/components/`. They use signal inputs, content projection, and `afterNextRender` mounting.

A single adapter contract — defined once in `core/angular` — provides reusable `bridgeSignal(scopeFactory)` and `mountAfterRender(callback)` utilities so per-plugin packages stay almost mechanical.

### Module 5 — Wrapper viewer (`@embedpdf/angular-pdf-viewer`)

Single standalone component:

```ts
@Component({ selector: 'embedpdf-viewer', standalone: true, changeDetection: OnPush })
class PdfViewer {
  config = input<PDFViewerConfig>({});
  init = output<EmbedPdfContainer>();
  ready = output<PluginRegistry>();
  themechange = output<{ preference: ThemePreference; colorScheme: 'light' | 'dark'; theme: Theme }>();
  container = signal<EmbedPdfContainer | null>(null);
  registry = signal<PluginRegistry | null>(null);
}
```

Mount lifecycle:
1. `afterNextRender` calls `EmbedPDF.init({ type: 'container', target: hostElement, ...config() })`.
2. Subscribes to the container's `themechange` custom event and forwards via the output.
3. When `container.registry` resolves, sets `registry()` signal and emits `ready`.
4. `inject(DestroyRef).onDestroy()` empties the host element to trigger the Web Component's `disconnectedCallback`.

The component depends only on `@embedpdf/snippet` (matching the existing React/Vue/Svelte wrappers) — it does **not** import any per-plugin `/angular` package, so it's unaffected by the v1.0 plugin scope.

### Module 6 — `ng add` schematic

Schematic shipped from `@embedpdf/angular-pdf-viewer`. Steps:

1. Update `package.json`: install `@embedpdf/angular-pdf-viewer`.
2. AST-modify `src/app/app.config.ts`: add `import { provideEmbedPdf } from '@embedpdf/core/angular'` and append `provideEmbedPdf({ engine: { wasmUrl: '/assets/pdfium.wasm' }, plugins: [/* defaults */] })` to the `providers` array.
3. Modify `angular.json`: append `{ "glob": "pdfium.wasm", "input": "node_modules/@embedpdf/pdfium/dist", "output": "/assets" }` to the application's `assets` array.
4. Print a one-paragraph next-steps message linking to `/docs/angular/setup`.

Idempotent: the AST step skips if `provideEmbedPdf` is already present. The `angular.json` step skips if a glob with the same `input` is already present.

### Module 7 — Custom example (`examples/angular-custom`)

Angular 21 application with no UI library. Single route. Floating vertical toolbar absolutely-positioned over the headless viewer; toolbar buttons styled with plain CSS (avoid Tailwind to keep dependency surface minimal). Uses only Phase A–C deliverables:
- `provideEmbedPdf({ engine, plugins })` registers all 13 v1.0 plugins.
- Composition mirrors the Svelte tracer: `<embedpdf-document-content>` → `<embedpdf-global-pointer-provider>` → `<embedpdf-viewport>` → `<embedpdf-scroller>` with `*embedpdfPage="let page"` template → `<embedpdf-rotate>` → `<embedpdf-page-pointer-provider>` → render/tiling/search layers.
- Toolbar actions wired through `injectZoom`, `injectRotate`, `injectSearch`, etc.

### Locked technical decisions

| Area | Decision |
|---|---|
| Peer range | `@angular/core >=21.0.0` |
| Build | `@analogjs/vite-plugin-angular` via `defineLibrary()` `'angular'` mode |
| Reactivity | Signals only; consumers using observables call `toObservable()` themselves |
| Helper naming | `injectXxx()` — no parallel `useXxx()` aliases |
| Class naming | No `Component`/`Service`/`Pipe`/`Directive` suffixes; `Pdf` casing not `PDF` |
| Selector prefix | `embedpdf-` |
| Render-prop equivalent | Structural directive `*embedpdfPage="let page"` with `ngTemplateContextGuard` |
| SSR | `afterNextRender` mounting; never touch browser APIs server-side |
| Modules | Standalone-only; no NgModules |
| Change detection | `OnPush` everywhere |
| Registry scoping | Angular DI per-injector — *not* a module-level singleton (deliberate divergence from Svelte) |

### Branch & PR strategy

A long-running integration branch `feature/angular` lives on `the-ult/embed-pdf-viewer`. **All implementation PRs target `feature/angular`, not `main`.** Each Phase issue (A0-A2, B1-B6, C1-C7, D, E, F, G) opens its own focused PR.

When all v1.0 phases (A–G) have merged into `feature/angular`, a **single upstream PR** opens from `the-ult:feature/angular` → `embedpdf:main`. This gives upstream maintainers one big review surface rather than 20 small ones, while letting our internal review iterate fast.

A heads-up GitHub Discussion on `embedpdf/embed-pdf-viewer` opens *before* Phase A starts so maintainers can object to scope, naming, or build-pipeline decisions before code is written.

## Testing Decisions

A good test for this work exercises the **public API surface** the way a consumer would, asserts on **observable outputs** (signal values, emitted outputs, rendered DOM), and never reaches into private internals. Tests should fail when the consumer-visible behaviour changes, regardless of how the implementation is refactored.

### Module 2 — `@embedpdf/core/angular` registry context (TestBed unit tests)

Test the public surface:
- `provideEmbedPdf({ engine: <fake>, plugins: [<fake plugin>] })` provides a registry that `injectRegistry()` returns once `pluginsReady()` resolves.
- `injectCapability<T>(id)` initially returns `provides: null`, then transitions to a non-null capability after the registry resolves, observed via reading the signal in a `flushEffects()`-style test.
- A registered plugin's state changes (via the fake plugin's store action) propagate to `injectCapability(...).provides()` consumers within one signal-flush cycle.
- `<embedpdf-provider>` rendered within an outer `provideEmbedPdf()` scope throws when `[engine]` is also supplied (two-registry detection).
- `DestroyRef` cleanup: tearing down the providing scope calls `registry.destroy()` exactly once.

Use a minimal fake `PdfEngine` and a fake `IPlugin` from `@embedpdf/core` test fixtures; do not load WASM. Prior art: see how `packages/core/src/svelte/components/EmbedPDF.svelte` and `packages/core/src/shared/components/embed-pdf.tsx` wire the registry — the public contract is identical, port to TestBed.

### Module 4 — `injectZoom` + `injectScroll` exemplar tests

The adapter pattern is uniform across 13 plugins; if these two pass, the rest are mechanical.

- `injectZoom(documentId)` initially returns `state.zoomLevel = initialDocumentState.zoomLevel` and `provides: null`.
- After the registry resolves, `provides` becomes a `ZoomScope`. Calling `provides()?.zoomIn()` updates the state signal on the next flush.
- Changing the `documentId` (signal or value) re-resolves the scope to the new document and re-bridges state subscriptions.
- `DestroyRef` cleanup: subscription returned by `scope.onStateChange` is disposed when the host component is destroyed.

Same approach for `injectScroll`. Prior art: `packages/plugin-zoom/src/svelte/hooks/use-zoom.svelte.ts` and `packages/plugin-zoom/src/vue/hooks/use-zoom.ts` — the contract is identical.

### Module 7 — Custom example end-to-end (Playwright)

Cannot reasonably unit-test the headless layer composition end-to-end — the underlying Web Component spawns a worker and downloads WASM, which jsdom does not support. End-to-end tests against `examples/angular-custom`:

- Boot the example against a known PDF. Assert at least one `<canvas>` renders with non-zero dimensions.
- Click "zoom in"; assert the canvas re-renders at higher resolution (canvas dimensions grow).
- Type a search query; assert at least one `<embedpdf-search-layer>` highlight appears.
- Trigger thumbnail toggle; assert the thumbnails sidebar mounts.
- Tear down the page (navigate away); assert the WASM worker exits within 2 seconds.

Prior art: there are currently no Playwright tests in the repo. This PRD introduces the harness — locate at `examples/angular-custom/e2e/` with a minimal `playwright.config.ts`. The same harness is reused later for the Wrapper viewer (Phase E) and `angular-tailwind` (v1.x).

### Module 6 — `ng add` schematic (`@angular-devkit/schematics/testing`)

Tree-based assertions:
- After running the schematic on a fresh `ng new` workspace tree, `package.json` lists `@embedpdf/angular-pdf-viewer` in `dependencies`.
- `app.config.ts` AST contains a `provideEmbedPdf({...})` call inside the `providers` array.
- `angular.json` `projects.<app>.architect.build.options.assets` includes the pdfium.wasm glob.
- Running the schematic a second time on the modified tree produces no further changes (idempotency).

Prior art: standard Angular schematic test pattern; reference any well-tested Angular library schematic (e.g. `@angular/material` schematics tests).

### Modules not under unit test in v1.0

- **Module 1 (build)** — verified by the fact that the Angular packages produce parseable output that the example app consumes. A `vite build --mode angular` smoke step in CI is enough.
- **Module 3 (engines)** — dynamic-import branching is too thin to justify mocks; covered transitively by Module 2's TestBed tests (which provide a fake engine) and the example app's Playwright tests (which exercise the real engine).
- **Module 5 (Wrapper viewer)** — covered by reusing the Playwright harness against a minimal Wrapper-viewer test page in the same `examples/angular-custom/e2e` folder.

## Out of Scope

- **`/angular` subpaths for non-v1.0 plugins**: `plugin-annotation`, `plugin-redaction`, `plugin-signature`, `plugin-form`, `plugin-attachment`, `plugin-bookmark`, `plugin-capture`, `plugin-commands`, `plugin-export`, `plugin-fullscreen`, `plugin-history`, `plugin-i18n`, `plugin-print`, `plugin-stamp`, `plugin-ui`, `plugin-ai-manager`, `plugin-layout-analysis`, `plugin-view-manager`. These ship in v1.x or v2.x in mechanical follow-ups using the Module 4 adapter pattern.
- **Material and Tailwind example apps**. `examples/angular-material` and `examples/angular-tailwind` are deferred to v1.x. The `angular-custom` example covers the headless story for v1.0; UI-library wrappers come once the API has stabilised.
- **Signal Forms ↔ AcroForms bridge**. The eventual design (`injectForm(documentId, { schema })` returning a `FormTree`) is captured in CONTEXT.md and the PRD's user stories so adopters know what to expect, but the actual code lands when `plugin-form/angular` ships.
- **Angular Material adapter package** (e.g. `@embedpdf/angular-material` for sidenav/snackbar wiring). Considered for a later release.
- **`ng update` migration schematics**. The first version of the schematic only handles `ng add`; migration support waits until there's a breaking change worth migrating across.
- **NgModule support / pre-Angular-21 compatibility**. The peer range is `>=21.0.0`. Consumers on Angular ≤20 are not supported by these packages.
- **Rewriting the Wrapper viewer to use the Headless layer internally**. The Wrapper continues to wrap `<embedpdf-container>` (the Snippet); rebuilding it on top of the Headless components is a far larger project that loses Shadow-DOM style isolation and is not justified by v1.0's goals.
- **Observable APIs**. Consumers needing `Observable<T>` use `toObservable()` from `@angular/core/rxjs-interop`. We do not ship a parallel observable surface.
- **Server-rendered PDFs**. Angular Universal renders an empty placeholder; the viewer mounts client-side. Pre-rendering the first page server-side is a future possibility, not a v1.0 commitment.

## Further Notes

### Why this matters

Every quarter EmbedPDF loses a meaningful number of evaluators to Angular-native PDF libraries because the integration story is bad. Closing this gap unblocks Angular shops that already chose React/Vue/Svelte sister apps to use EmbedPDF — and brings in net-new logo wins.

### Why headless-first ordering

The original PRD ordered Wrapper-viewer first. The revised order (headless first, Wrapper second) is better for three reasons:

1. **Validates the API earlier**. The Wrapper viewer is a thin wrapper around an existing Web Component; it can't surface design problems in the headless layer because it doesn't use it. Building the headless layer first, with the custom example as the proof-of-life, exposes API mistakes while they're still cheap to fix.
2. **Shipping sequence matches power-user demand**. Angular shops adopting EmbedPDF for production are the ones who care most about Material/Tailwind/custom UIs — i.e. the headless layer. Snippet-style consumers can already use the Web Component directly today via `CUSTOM_ELEMENTS_SCHEMA`; they're not blocked.
3. **Smaller tracer bullet**. Phase A+B is 9 packages; once they compile and render a PDF, every subsequent phase is mechanical layering. Wrapper-first would mean owning the full snippet API surface before validating any of the underlying Angular plumbing.

### Risks to watch during implementation

1. **Angular CLI esbuild worker bundling**. Verify in a real `ng build --configuration production` that dynamic imports of `@embedpdf/engines/pdfium-worker-engine` produce a separate chunk loadable by the Web Worker constructor. If not, document the workaround (move worker into a static import + ship a separate `worker-loader` file).
2. **AnalogJS plugin lag behind Angular minor releases**. Pin the version in `@embedpdf/build`, smoke-test against a fresh `ng new` app on each Angular minor bump.
3. **Web Component upgrade timing under strict CSP**. Some `'unsafe-eval'`-free CSPs reject the snippet's bundled minifier output. Document CSP requirements early.
4. **Two-registry mistake**. `<embedpdf-provider>` nested inside a `provideEmbedPdf()` scope must throw clearly; lint-rule or runtime check, not silent duplication.
5. **`Scroller` virtualization**. The Svelte component owns layout and uses `setLayoutReady` after `$effect.pre`. Angular equivalent must use `afterNextRender({ write: () => setLayoutReady() })` to ensure the DOM has the projected page views before reporting layout ready. Tracking this with a TODO comment and an integration test against the custom example is sufficient.

### Recommended rollout cadence

- Week 1: heads-up Discussion opens upstream. Phase A (modules 1–3) lands in `feature/angular`.
- Weeks 2–3: Phase B (six packages, but mostly mechanical once A is stable).
- Week 4: Phase C (seven packages, parallelisable across contributors).
- Week 5: Phase D (`angular-custom` example) — flushes out any final API issues.
- Week 6: Phase E (Wrapper viewer) + Phase F (schematic).
- Week 7: Phase G (docs).
- Week 8: upstream PR `the-ult:feature/angular` → `embedpdf:main`.

This sequence assumes the upstream Discussion happens during Week 1 and gets an OK from maintainers before Week 2 starts.
