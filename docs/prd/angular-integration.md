# PRD — Angular integration (v1.0)

> **Status**: Draft, ready for upstream discussion
> **Date**: 2026-05-08 (revised: scope expanded to 17 plugins for read-only viewing parity; Playwright dropped in favour of Vitest browser mode; A0 added for build-tooling fix + test pipeline)
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

Ship a two-tier Angular integration that mirrors the React/Vue/Svelte pattern *plus* takes advantage of Angular-specific primitives. **Build the headless layer first** so the customisation power is available from day one, then layer the battery-included Wrapper viewer on top (Phase E may ship in parallel with B–D since it depends only on Phase A's foundation, not the per-plugin adapters).

- **Headless layer** — per-package `/angular` subpath exports across `@embedpdf/core`, `@embedpdf/engines`, and 15 plugins covering read-only viewing. Angular consumers configure the registry via `provideEmbedPdf({ engine, plugins })` at app or route scope (idiomatic Angular, like `provideRouter`), then read state via `injectXxx()` injection-context functions returning Signals. Layer components like `<embedpdf-viewport>`, `<embedpdf-scroller>`, `<embedpdf-render-layer>` slot into custom layouts. A `<ng-template embedpdfPage let-page>` directive carries the per-page render context (Angular's idiomatic translation of Svelte's `renderPage` snippet / React's render-prop).
- **Headless proof-of-life example** — `examples/angular-custom` exercises the headless layer end-to-end with a floating Adobe-style vertical toolbar over the viewer (zoom, pan, rotate, search, thumbnail toggle, fullscreen, print, save).
- **Wrapper viewer (`@embedpdf/angular-pdf-viewer`)** — a single standalone component, `<embedpdf-viewer>` exported as the class `PDFViewer`, that drops into any Angular 21 app and renders the full snippet with theme/icon/i18n/plugin support already wired in. One import, one tag, one `config` input. **Drop-in consumers get the full feature set on day one** — annotation, redaction, signature, forms, AI etc. — because the Wrapper wraps the Snippet's Web Component which bakes in every plugin internally. The v1.0 17-plugin scope only constrains custom-viewer authors who want to compose with the headless layer.
- **Schematic** — `ng add @embedpdf/angular-pdf-viewer` ships **two flows**: drop-in (default) only adds the PDFium WASM glob to `angular.json`; `--headless` additionally inserts `provideEmbedPdf({...})` into `app.config.ts`.
- **Documentation** — `/docs/angular/*` mirrors the React/Vue/Svelte sections of the existing docs site, plus a single migration page targeted at `ngx-extended-pdf-viewer` shops.
- **Testing pipeline (new)** — Vitest is wired in as part of A0. Hooks/utilities run as Node-mode unit tests; standalone components and directives run under Vitest browser mode (chromium) via `@analogjs/vitest-angular`. No Playwright in v1.0.

Angular consumers get the same "works in 60 seconds" Wrapper story as React/Vue/Svelte, and Angular shops that want a custom UI get a Signals-native, zoneless-clean, route-scopable headless API that reads like idiomatic Angular 21 code.

## v1.0 plugin scope

The v1.0 cut is **read-only viewing only**. Anything that creates content, edits, or tracks edits defers to v1.x.

**In scope (17 packages — `@embedpdf/{core,engines}` plus 15 plugins):**

| Phase | Plugin | Purpose |
|---|---|---|
| A | `core` | Registry / DI |
| A | `engines` | PDFium bootstrap |
| B | `document-manager` | Open / close docs |
| B | `viewport` | Scrollable host |
| B | `scroll` | Page virtualization |
| B | `render` | Page rasterization |
| B | `tiling` | High-res tiles on zoom |
| B | `interaction-manager` | Pointer events |
| C | `zoom` | + / − / fit / marquee |
| C | `pan` | Hand tool |
| C | `rotate` | Rotate page |
| C | `search` | Find in document |
| C | `selection` | Text select / copy |
| C | `spread` | Single / double / cover |
| C | `thumbnail` | Sidebar strip |
| C | `fullscreen` | F11 / Esc |
| C | `i18n` | Translatable labels |
| C | `print` | Ctrl+P / dialog |
| C | `export` | Download / Save As |

**Deferred to v1.x:**

- **v1.1 — editing surface**: `annotation`, `redaction`, `signature`, `stamp`, `plugin-ui` (schema-driven toolbar/sidebar engine).
- **v1.2 — forms + navigation + history**: `form` (Signal Forms ↔ AcroForms bridge — Signal Forms is production-ready in Angular 21+, no version block), `bookmark` (PDF outline TOC), `attachment`, `history` (undo/redo), `capture` (marquee screenshot), `commands`.
- **v2.0 — heavy / specialised**: `ai-manager`, `layout-analysis`, `view-manager`.

The Wrapper viewer is **not** subject to this scope. Drop-in consumers get every plugin via the Snippet on day one.

## User Stories

### Phase A0 — foundation tooling (pre-flight)

1. As an EmbedPDF maintainer, I want bug #27 (`unplugin-dts` silently skips pure `export *` re-export base entries) fixed in `@embedpdf/build` before any plugin's `/angular` subpath ships, so that 17 packages don't silently miss their `dist/index.d.ts`.
2. As an EmbedPDF maintainer, I want a build-time validator that fails the build if a `package.json`-advertised `types` entry is missing from `dist/`, so that future regressions of #27 are caught automatically.
3. As an EmbedPDF maintainer, I want Vitest wired into the repo (root `vitest.workspace.ts`, `test` task in `turbo.json`, `test` scripts per package, a `.github/workflows/test.yml`), so that the dormant `packages/models/src/*.test.ts` files become live and the new Angular packages have a real quality gate.
4. As an EmbedPDF maintainer, I want CI-gating split between fast Node-mode tests (every PR) and slower browser-mode tests (path-filtered to PRs touching `packages/*/src/angular/**`, `viewers/angular/**`, or `examples/angular-custom/**`), so that Angular work is fully tested without slowing every unrelated PR.

### Phase A — registry & engine foundation

5. As an Angular architect, I want to call `provideEmbedPdf({ engine, plugins })` inside a route's `providers` array, so that the engine and registry live for the route's lifetime and don't tear down on intra-route navigation.
6. As an Angular architect, I want to call `provideEmbedPdfEngine({...})` separately for advanced cases where one engine instance is shared across multiple registries, so that I can render multiple PDFs with separate plugin sets without re-downloading WASM.
7. As an Angular developer, I want a `<embedpdf-provider [engine] [plugins]>` standalone component as an alternative to the provider function, so that I can scope two viewers within the same component template (one engine each).
8. As an Angular developer, the `<embedpdf-provider>` component should detect a registry already in scope and refuse to create a duplicate, so that I can't accidentally double-bootstrap and waste a worker.
9. As an Angular developer, I want `injectPdfiumEngine({ wasmUrl, worker, fontFallback })` to return signals for engine, isLoading, and error, so that my UI can render loading and error states directly from the template.
10. As an Angular developer, I want `injectRegistry()`, `injectPlugin<T>(id)`, `injectCapability<T>(id)`, `injectActiveDocument()`, `injectDocumentStates()`, `injectCoreState()` returning signals, so that I can derive computed values reactively without manual subscriptions.
11. As a per-plugin adapter author, I want a single shared `bridgeScopeState(pluginId, documentId, initialState)` utility exported from `@embedpdf/core/angular`, so that every `inject*` hook is one mechanical call rather than 17 hand-written subscription bridges.
12. As an Angular SSR developer, I want all browser-API touches (engine creation, WASM fetch, `customElements` lookup) deferred to `afterNextRender`, so that server rendering doesn't crash on missing browser globals.

### Phase B — minimum viable render

13. As an Angular developer following the getting-started guide, I want to register `DocumentManager`, `Viewport`, `Scroll`, `Render`, `Tiling`, and `InteractionManager` plugins and see a PDF render in my app, so that the tracer bullet works end-to-end before I add any chrome.
14. As an Angular developer, I want `<embedpdf-document-content [documentId]>` exposing `isLoading`, `isError`, `isLoaded` signals via template context, so that I can render loading skeletons and password prompts using `@if` / `@switch` blocks.
15. As an Angular developer, I want `<embedpdf-viewport [documentId]>` with content projection as the scrollable host, so that I can apply my own classes/styles and project the scroller inside.
16. As an Angular developer, I want `<embedpdf-scroller [documentId]>` to virtualize page layout and expose a `*embedpdfPage="let page"` template directive, so that I render each visible page through a typed template context.
17. As an Angular developer, I want strict template type-checking on the `*embedpdfPage` context via `ngTemplateContextGuard`, so that the compiler catches typos in my `let-page` bindings.
18. As an Angular developer, I want `<embedpdf-render-layer>` and `<embedpdf-tiling-layer>` to render PDFium output and high-resolution tiles, so that pages stay sharp at any zoom level.
19. As an Angular developer, I want `<embedpdf-global-pointer-provider>` and `<embedpdf-page-pointer-provider>` as scope wrappers, so that interaction-manager-aware children (zoom, pan, capture, selection) receive pointer events.

### Phase C — viewing essentials

20. As an Angular developer, I want `injectZoom(documentId)` returning `{ state, provides }` as signals, so that I can wire +, −, fit-page, fit-width, zoom-to-mode buttons in my own toolbar, plus `<embedpdf-marquee-zoom>` for drag-to-zoom-region UX.
21. As an Angular developer, I want `injectPan(documentId)` so that I can implement a hand-tool toggle.
22. As an Angular developer, I want `injectRotate(documentId)` and `<embedpdf-rotate>` so that I can rotate a page (the wrapper component) and read current rotation as a signal (the helper).
23. As an Angular developer, I want `injectSelection(documentId)` plus `<embedpdf-selection-layer>` projecting a selection-menu template, so that I can show context menus over a text selection with my own button styles.
24. As an Angular developer, I want `injectSearch(documentId)` returning current matches and active match index as signals, plus `<embedpdf-search-layer>` overlaying highlights on matched text.
25. As an Angular developer, I want `injectSpread(documentId)` so that I can offer single / double / cover spread modes.
26. As an Angular developer, I want `injectThumbnail(documentId)` returning a signal over the thumbnail strip data, so that I can render thumbnails in a sidebar with `@for`.
27. As an Angular developer, I want `injectFullscreen(documentId)` returning `{ isFullscreen, enter, exit, toggle }`, so that I can wire an F11 / fullscreen button.
28. As an Angular developer, I want `injectI18n()` returning `{ locale, t, setLocale }` as signals, so that translatable strings used by every other plugin's helpers and components are reactively translated.
29. As an Angular developer, I want `injectPrint(documentId)` exposing the print capability, so that I can wire a Ctrl+P flow on any custom toolbar.
30. As an Angular developer, I want `injectExport(documentId)` returning `{ download, saveAsCopy }`, so that consumers can download the current PDF or grab the bytes as `ArrayBuffer` for further processing.

### Phase D — custom example

31. As an Angular developer evaluating EmbedPDF for a custom design system, I want a working example app demonstrating a floating Adobe-style vertical toolbar over the headless viewer with all v1.0 actions (zoom, pan, rotate, search, thumbnails, fullscreen, print, save), so that I can copy the integration pattern without importing a UI library.
32. As an Angular developer learning the headless API, I want the example to follow the same composition pattern as the Svelte and React examples (`DocumentContent → GlobalPointerProvider → Viewport → Scroller → Rotate → PagePointerProvider → render layers`), so that cross-framework documentation is one-to-one.
33. As an Angular developer reviewing the example, I want the example app to ship a single Vitest browser-mode smoke test that asserts the page mounts and a `<canvas>` appears, so that the example doesn't silently break on dependency bumps.

### Phase E — battery-included Wrapper viewer (parallel-shippable)

34. As an Angular developer evaluating PDF libraries, I want to install `@embedpdf/angular-pdf-viewer` and render a PDF in under five minutes with zero plugin choices, so that EmbedPDF beats my time-to-first-render bar before I evaluate features.
35. As an Angular developer, I want to import a single `PDFViewer` standalone class (selector `<embedpdf-viewer>`), so that I can drop it into any standalone-component app without an NgModule. The class name preserves cross-framework symmetry with `@embedpdf/{react,vue,svelte}-pdf-viewer` and is the one explicit exception to the Angular-style "no ALLCAPS in identifiers" rule.
36. As an Angular developer, I want to pass the same flat `PDFViewerConfig` object I see in the React/Vue docs, so that cross-framework documentation translates one-to-one.
37. As an Angular developer, I want signal-based outputs for `init`, `ready`, and `themechange`, so that I can react to viewer lifecycle events from a `computed()` or `effect()` without RxJS bridging.
38. As an Angular SSR developer, I want the viewer to render an empty placeholder on the server and mount the actual viewer in the browser, so that my app boots cleanly under Angular Universal without hydration mismatches.
39. As an Angular developer, I want the Wrapper viewer to clean up on `ngOnDestroy` / `DestroyRef`, so that route changes don't leak workers or WASM memory.

### Phase F — `ng add` schematic (split flows)

40. As an Angular developer setting up a new project, I want to run `ng add @embedpdf/angular-pdf-viewer` and have the package installed plus the PDFium WASM glob added to `angular.json` `assets[]`, so that `<embedpdf-viewer>` works on the next reload with no further setup. **No `provideEmbedPdf` is inserted on the drop-in path** — the Snippet handles WASM loading internally.
41. As an Angular developer building a custom viewer, I want `ng add @embedpdf/angular-pdf-viewer --headless` to additionally insert a `provideEmbedPdf({ engine, plugins: [/* defaults */] })` block into `app.config.ts`, so that the headless layer works out of the box.
42. As an Angular developer, I want both schematic flows to be idempotent (no duplicate inserts on second run), so that re-running after a `ng update` is safe.
43. As an Angular developer, I want the schematic to prompt before overwriting any existing EmbedPDF configuration, so that I don't lose customisations.

### Phase G — documentation

44. As a developer searching for PDF libraries, I want documentation pages at `https://www.embedpdf.com/docs/angular/*` mirroring the React/Vue/Svelte sections, so that the integration is discoverable through the marketing site.
45. As an Angular developer reading the docs, I want the page structure to follow the existing per-framework hierarchy (Setup → Headless Introduction → Layers → Plugin pages → Recipes → Viewer → Code Examples), so that I learn EmbedPDF the same way React/Vue developers do.
46. As an Angular shop migrating from `ngx-extended-pdf-viewer`, I want a single `docs/angular/migrating-from-ngx-extended-pdf-viewer.md` page mapping common APIs, so that switching costs are visible and small.
47. As an EmbedPDF maintainer, I want the docs site to render Angular code samples with proper syntax highlighting (TypeScript + signal-form template syntax + Angular control-flow `@if`/`@for`), so that the examples don't look broken.

### Build, packaging, distribution (cross-cutting)

48. As an EmbedPDF maintainer, I want the Angular packages to build via the existing `@embedpdf/build` `defineLibrary()` pipeline with the existing `'angular'` mode, so that I don't have to maintain a second build system.
49. As an EmbedPDF maintainer, I want each Angular subpath (`@embedpdf/core/angular`, etc.) to land in `dist/angular/index.{js,cjs,d.ts}` mirroring the existing `dist/<framework>/` shape, so that the publish flow is identical to React/Vue/Svelte.
50. As an EmbedPDF maintainer, I want each touched package's `exports` map to gain a `"./angular"` entry, so that consumers import via `@embedpdf/<pkg>/angular` per the existing convention.
51. As an Angular consumer, I want each package to declare `peerDependencies: { '@angular/core': '>=21.0.0' }`, so that npm/pnpm warns me at install time if I'm on an older Angular version.
52. As an Angular consumer, I want the published packages to ship as ESM-first FESM2022 with CJS fallback, so that they work in both modern `ng build` and legacy bundlers.
53. As a zoneless Angular consumer, I want all components to use `ChangeDetectionStrategy.OnPush` and signal-based state, so that the integration cooperates with `provideZonelessChangeDetection()` out of the box.
54. As an EmbedPDF maintainer, I want every plugin PR landing on `feature/angular` to ship a `minor` bump changeset, so that the upstream merge consolidates them through the existing changesets release flow without manual version juggling.

## Implementation Decisions

### Standard issue preamble (non-negotiable for every plugin issue)

Every B/C and E1 issue body opens with a required review pass. The PRD does **not** spell out implementation specifics per plugin — those are derived by the implementer from the existing framework adapters during this preamble. The preamble:

> ## Before implementation — required review pass
>
> Do not start coding until this is done. Implementation choices should be derived from the existing framework adapters, not from the PRD or this issue body in isolation.
>
> 1. **Read the framework-neutral surface** — `packages/<this-plugin>/src/lib/`. Understand the capability, scope, state shape, store actions, and lifecycle hooks. This is the contract; the Angular adapter is one of multiple consumers.
> 2. **Read the Svelte adapter** — `packages/<this-plugin>/src/svelte/`. Note hooks, components, snippets/render-props, effect ordering (`$effect` vs `$effect.pre`), cleanup behavior, and any guards (stale-data, race conditions, scope re-resolution on documentId change).
> 3. **Read the Vue adapter** — `packages/<this-plugin>/src/vue/`. Note differences from Svelte (refs vs runes, `watch` immediate, `onCleanup`, `MaybeRefOrGetter` accepts plain values).
> 4. **Read the React/Preact adapter** — `packages/<this-plugin>/src/react/` and `src/preact/`. Note JSX ergonomics that influenced the framework-neutral surface.
> 5. **Write a one-page implementation plan** as a comment on this issue covering:
>     - Mapping table: Svelte primitive → Angular 21 primitive (`$state` → `signal`, `$effect.pre` → `effect()` pre-render, `Snippet<[T]>` → `*embedpdfPage` structural directive, `bind:` → `model()` two-way input, `dispatch` → `output()`).
>     - Where signal-based state is bridged via `bridgeScopeState` from `@embedpdf/core/angular`. Do not invent new bridges; if the shared utility doesn't fit, raise it as a question on A2 first.
>     - SSR posture: which work goes inside `afterNextRender`, which is safe in `effect()`.
>     - Cleanup: `DestroyRef` wiring for every subscription returned by `scope.onStateChange` / `onScrollerData` / etc.
>     - Strict template type-check guards (`ngTemplateContextGuard`) for any structural directive.
>     - Tests: Node-mode Vitest for hooks, browser-mode Vitest (chromium) via `@analogjs/vitest-angular` for components.
> 6. **Get the plan ack'd** in the issue thread before opening the implementation PR.
>
> **Standards to follow:**
> - Angular 21 best practices: standalone-only, `OnPush`, signal inputs (`input()` / `input.required()` / `model()`), signal outputs (`output()`), no decorators with `@Input()/@Output()`, no NgModules, no `Component`/`Service`/`Directive`/`Pipe` class suffixes (single exception: `PDFViewer` for cross-framework symmetry), `inject()` over constructor injection.
> - Modern TypeScript (5.9+): prefer `satisfies` over annotations where it adds inference, no `any` (use `unknown` and narrow), exact-optional types, exhaustive `switch` checks via `never`.
> - Reactivity: signals only. Consumers needing observables call `toObservable()` themselves; we do not ship a parallel observable surface.
> - SSR-safe: never touch `document`, `window`, `customElements`, or fetch WASM at module scope. All browser-API touches go through `afterNextRender`.

### Composition pattern — `embedpdfPage` template directive

The Svelte `Scroller` uses a `Snippet<[PageLayout]>` (`{#snippet renderPage(page)}…{/snippet}`); React uses a render-prop (`renderPage={({pageIndex}) => …}`). Angular's idiomatic translation is a structural directive on `<ng-template>` with a typed context guard:

```ts
interface EmbedpdfPageContext {
  $implicit: PageLayout;
  page: PageLayout;
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

The `Scroller` queries the projected `EmbedpdfPageTemplate` via `contentChild(EmbedpdfPageTemplate)` and instantiates one view per visible page using `ViewContainerRef.createEmbeddedView(template, { $implicit: page, page })`. `setLayoutReady(documentId)` fires inside `effect()` (matching Svelte's `$effect.pre` semantics — `setLayoutReady` does not read DOM).

### Phase ordering

| Phase | Scope | Independently usable? |
|---|---|---|
| **A0 — pre-flight** | Bug #27 fix in `defineLibrary()`; Vitest pipeline (root config, turbo task, CI workflow); revive dormant `packages/models/src/*.test.ts` | n/a — blocks everything else |
| **A — Foundation** | `@embedpdf/core/angular`; `@embedpdf/engines/angular`; `bridgeScopeState` + `bridgeCoreSignal` shared utilities | `provideEmbedPdf()` resolves with a fake plugin in tests; no UI yet |
| **B — Minimum viable render** | `plugin-{document-manager,viewport,scroll,render,tiling,interaction-manager}/angular` (6 packages) | Consumer can render a PDF with no toolbar |
| **C — Viewing essentials** | `plugin-{zoom,pan,rotate,selection,search,spread,thumbnail,fullscreen,i18n,print,export}/angular` (11 packages) | All v1.0 helpers and layer components — parallelisable across contributors |
| **D — Custom example** | `examples/angular-custom` (floating Adobe-style toolbar) | End-to-end demo with v1.0 features only |
| **E — Wrapper viewer** | `viewers/angular` → `@embedpdf/angular-pdf-viewer` | Drop-in `<embedpdf-viewer>`. **May ship in parallel with B–D** — depends only on Phase A0+A1 (build mode + dts fix) and `@embedpdf/snippet`, *not* on the per-plugin `/angular` adapters |
| **F — Schematic** | `ng add @embedpdf/angular-pdf-viewer` (drop-in flow) and `--headless` flow | One-command setup, two flows |
| **G — Documentation** | `website/docs/angular/*` plus migration page from `ngx-extended-pdf-viewer` | Public-facing docs |

### Module 1 — `@embedpdf/build` `'angular'` mode (already shipped — A0 fixes its dts gap)

Extends `defineLibrary()` in the build preset with a fifth case alongside the existing `react`/`preact`/`vue`/`svelte` modes. Inputs per consuming package are `src/angular/index.ts` and `src/angular/tsconfig.angular.json`. Output goes to `dist/angular/index.{js,cjs}` and emits typings via `unplugin-dts`. The mode loads `@analogjs/vite-plugin-angular` and externalizes `@angular/*`, `rxjs`, `tslib`, and the existing `@embedpdf/*` peer pattern. See [ADR 0001](../adr/0001-angular-publishing-via-analogjs-vite.md).

**A0 closes a gap in this module**: `unplugin-dts` silently skips pure `export *` re-export base entries (issue #27). Fix in `defineLibrary()` plus a build-time validator that fails when a `package.json`-advertised `types` entry is missing from `dist/`.

### Module 2 — `@embedpdf/core/angular` registry context

Exports `provideEmbedPdf()`, `provideEmbedPdfEngine()` (re-export), `<embedpdf-provider>`, `injectRegistry()`, `injectPlugin<T>(id)`, `injectCapability<T>(id)`, document-state helpers (`injectActiveDocument`, `injectDocumentStates`, `injectCoreState`), **and the shared adapter utilities `bridgeScopeState` and `bridgeCoreSignal` consumed by every per-plugin `inject*` hook**. Both registry surfaces resolve a single private `InjectionToken<PluginRegistry>` so all `injectXxx` helpers consume the same registry regardless of how it was provided. See [ADR 0002](../adr/0002-angular-headless-registry-via-provider-function.md).

API contract:

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

@Component({ selector: 'embedpdf-provider', standalone: true /* … */ })
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
};
function injectCapability<T extends BasePlugin>(id: T['id']): {
  provides: Signal<ReturnType<NonNullable<T['provides']>> | null>;
  isLoading: Signal<boolean>;
};
function injectActiveDocument(): Signal<DocumentState | null>;
function injectDocumentStates(): Signal<DocumentState[]>;
function injectRegistryReady(): Signal<boolean>;

// Shared adapter utilities — used by every per-plugin `inject*` hook
function bridgeScopeState<P extends BasePlugin, S>(
  pluginId: P['id'],
  documentId: Signal<string> | string | (() => string),
  initialState: S,
): {
  state: Signal<S>;
  provides: Signal<Scope<P> | null>;
};

function bridgeCoreSignal<T>(selector: (state: CoreState) => T): Signal<T>;
```

Internal signal wiring uses `effect()` to subscribe to `registry.getStore().subscribe(...)` and update a `WritableSignal`. Cleanup hooks into `inject(DestroyRef)` so the registry is destroyed when the providing scope tears down. The registry lives behind an `InjectionToken`, **not** a module-level `$state` singleton — Svelte's approach can't host two viewers in one app; Angular DI scoping fixes this for free.

### Module 3 — `@embedpdf/engines/angular`

Exports `provideEmbedPdfEngine()` and `injectPdfiumEngine({...})`. The injection function dynamically imports `@embedpdf/engines/pdfium-worker-engine` or `@embedpdf/engines/pdfium-direct-engine` based on the `worker` flag, mirroring the existing Vue/Svelte hooks. Returns `{ engine: Signal<PdfEngine | null>; isLoading: Signal<boolean>; error: Signal<Error | null> }`. Cleanup goes through `DestroyRef` and calls `engine.closeAllDocuments()` then `engine.destroy()`.

### Module 4 — Per-plugin `/angular` adapter pattern

Each of the 15 plugins shipped in v1.0 follows the same shape:

- `src/angular/index.ts` re-exports `inject*` helpers, layer components, and the base plugin's framework-neutral exports.
- `src/angular/inject-<name>.ts` per plugin: takes `documentId: Signal<string> | string | (() => string)`, returns `{ state: Signal<XxxDocumentState>; provides: Signal<XxxScope | null> }`. **The body is a single `bridgeScopeState` call** — no hand-written subscription bridges.
- Layer components (`Viewport`, `Scroller`, `RenderLayer`, `TilingLayer`, `SelectionLayer`, `SearchLayer`, `Rotate`, `MarqueeZoom`, etc.) are standalone components mirroring the existing Svelte layer components in `packages/plugin-*/src/svelte/components/`. Signal inputs, content projection, `afterNextRender` mounting where needed.

Each plugin's package.json gains `"./angular": { types, import, require }` in the `exports` map. Each PR ships a `minor` bump changeset for that package.

### Module 5 — Wrapper viewer (`@embedpdf/angular-pdf-viewer`)

Single standalone component, exported as the class **`PDFViewer`** (cross-framework symmetry — explicit exception to the Angular ALLCAPS-in-identifiers rule):

```ts
@Component({ selector: 'embedpdf-viewer', standalone: true, changeDetection: OnPush })
export class PDFViewer {
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

The component depends only on `@embedpdf/snippet`. **It does not import any per-plugin `/angular` package**, so it's unaffected by the v1.0 plugin scope and can ship in parallel with B–D. Drop-in consumers get the full Snippet feature set on day one — annotation, redaction, signature, forms, AI etc. — even though those plugins' `/angular` headless adapters defer to v1.x.

### Module 6 — `ng add` schematic (split flows)

Schematic shipped from `@embedpdf/angular-pdf-viewer`. Two flows.

**Drop-in flow (`ng add @embedpdf/angular-pdf-viewer`):**
1. Update `package.json`: install `@embedpdf/angular-pdf-viewer`.
2. Modify `angular.json`: append `{ "glob": "pdfium.wasm", "input": "node_modules/@embedpdf/pdfium/dist", "output": "/assets" }` to the application's `assets` array.
3. Print a one-paragraph next-steps message linking to `/docs/angular/setup`.

**Headless flow (`ng add @embedpdf/angular-pdf-viewer --headless`):**
1. Same as drop-in flow.
2. Additionally AST-modifies `src/app/app.config.ts`: adds `import { provideEmbedPdf } from '@embedpdf/core/angular'` and appends `provideEmbedPdf({ engine: { wasmUrl: '/assets/pdfium.wasm' }, plugins: [/* defaults */] })` to the `providers` array.

Both flows are idempotent — the AST step skips if `provideEmbedPdf` is already present; the `angular.json` step skips if a glob with the same `input` is already present.

### Module 7 — Custom example (`examples/angular-custom`)

Angular 21 application with no UI library. Single route. Floating vertical toolbar absolutely-positioned over the headless viewer; toolbar buttons styled with plain CSS. Uses only Phase A–C deliverables.

Composition mirrors the Svelte tracer: `<embedpdf-document-content>` → `<embedpdf-global-pointer-provider>` → `<embedpdf-viewport>` → `<embedpdf-scroller>` with `*embedpdfPage="let page"` template → `<embedpdf-rotate>` → `<embedpdf-page-pointer-provider>` → render/tiling/search layers.

Toolbar actions wired through `injectZoom`, `injectRotate`, `injectSearch`, `injectThumbnail`, `injectFullscreen`, `injectI18n`, `injectPrint`, `injectExport`.

A single Vitest browser-mode smoke test asserts the page mounts and a `<canvas>` appears.

### Module 8 — Test pipeline (new in this revision)

A0 establishes the repo's first real test pipeline.

- **Stack**: Vitest. Node mode for hooks/utilities, browser mode (chromium) via `@analogjs/vitest-angular` for standalone components and directives.
- **Workspace**: root `vitest.workspace.ts` glues per-package configs.
- **Turbo**: a `test` task with `dependsOn: ["^build"]`.
- **CI**: a `.github/workflows/test.yml` that runs `pnpm test` on PR + push to `feature/angular`/`main`. Node-mode tests run on every PR; browser-mode tests path-filtered to PRs touching `packages/*/src/angular/**`, `viewers/angular/**`, or `examples/angular-custom/**`.
- **Legacy**: dormant `packages/models/src/*.test.ts` files become live; A0 verifies they pass and fixes them if not.

### Locked technical decisions

| Area | Decision |
|---|---|
| Peer range | `@angular/core >=21.0.0` |
| Build | `@analogjs/vite-plugin-angular` via `defineLibrary()` `'angular'` mode |
| Reactivity | Signals only; consumers using observables call `toObservable()` themselves |
| Helper naming | `inject*()` — no parallel `use*()` aliases |
| Class naming | No `Component`/`Service`/`Pipe`/`Directive` suffixes; `Pdf` casing not `PDF` — single exception `PDFViewer` for cross-framework symmetry |
| Selector prefix | `embedpdf-` |
| Wrapper selector | `embedpdf-viewer` (class `PDFViewer`) |
| Render-prop equivalent | Structural directive `*embedpdfPage="let page"` with `ngTemplateContextGuard` |
| SSR | `afterNextRender` mounting; never touch browser APIs server-side |
| Modules | Standalone-only; no NgModules |
| Change detection | `OnPush` everywhere |
| Registry scoping | Angular DI per-injector — *not* a module-level singleton (deliberate divergence from Svelte) |
| Testing | Vitest unit + Vitest browser mode; no Playwright in v1.0 |
| Schematic | Two flows: drop-in (default) and `--headless` |

### Branch & PR strategy

A long-running integration branch `feature/angular` lives on `the-ult/embed-pdf-viewer`. **All implementation PRs target `feature/angular`, not `main`.** Each issue (A0, A2, A3, B1–B6, C1–C11, D, E, F, G) opens its own focused PR. Each plugin PR ships a `minor` bump changeset for that package.

When all v1.0 phases (A0 + A–G) have merged into `feature/angular`, a **single upstream PR** opens from `the-ult:feature/angular` → `embedpdf:main`, consolidating every changeset for one release.

A heads-up GitHub Discussion on `embedpdf/embed-pdf-viewer` opens *before* Phase B1 starts (after A0 + the B7 tracer demo) so maintainers can object to scope, naming, or build-pipeline decisions before mass implementation begins.

## Testing Decisions

A good test for this work exercises the **public API surface** the way a consumer would, asserts on **observable outputs** (signal values, emitted outputs, rendered DOM), and never reaches into private internals. Tests should fail when consumer-visible behaviour changes, regardless of how the implementation is refactored.

### Module 2 — `@embedpdf/core/angular` (Vitest Node + Browser)

Test the public surface:
- `provideEmbedPdf({ engine: <fake>, plugins: [<fake plugin>] })` provides a registry that `injectRegistry()` returns once `pluginsReady()` resolves.
- `injectCapability<T>(id)` initially returns `provides: null`, then transitions to a non-null capability after the registry resolves, observed via reading the signal in a `flushEffects()`-style test.
- A registered plugin's state changes (via the fake plugin's store action) propagate to `injectCapability(...).provides()` consumers within one signal-flush cycle.
- `<embedpdf-provider>` (browser mode) rendered within an outer `provideEmbedPdf()` scope throws when `[engine]` is also supplied (two-registry detection).
- `bridgeScopeState` returns initial state immediately and re-bridges on `documentId` change.
- `DestroyRef` cleanup: tearing down the providing scope calls `registry.destroy()` exactly once.

Use a minimal fake `PdfEngine` and a fake `IPlugin` from `@embedpdf/core` test fixtures; do not load WASM.

### Module 4 — `injectZoom` + `injectScroll` exemplar tests

The adapter pattern is uniform across 15 plugins; if these two pass, the rest are mechanical.

- `injectZoom(documentId)` initially returns `state.zoomLevel = initialDocumentState.zoomLevel` and `provides: null`.
- After the registry resolves, `provides` becomes a `ZoomScope`. Calling `provides()?.zoomIn()` updates the state signal on the next flush.
- Changing the `documentId` (signal or value) re-resolves the scope to the new document and re-bridges state subscriptions.
- `DestroyRef` cleanup: subscription returned by `scope.onStateChange` is disposed when the host component is destroyed.

Browser-mode tests cover `<embedpdf-marquee-zoom>` and `<embedpdf-scroller>`'s page virtualization.

### Module 5 — Wrapper viewer (Vitest browser mode)

Mount `<embedpdf-viewer [config]="{ src: <data-uri PDF> }">`, await `(ready)`, assert a `<canvas>` rendered with non-zero dimensions inside the Web Component's shadow root. Tear down the host fixture; assert the WASM worker is terminated within 2 seconds.

### Module 7 — Custom example (Vitest browser mode smoke)

Single test in `examples/angular-custom/src/__tests__/`: bootstrap the example app against a known PDF, assert a `<canvas>` renders. Heavier interaction tests (zoom, search, thumbnail toggle) live alongside their plugin packages, not in the example.

## Out of Scope

- **`/angular` subpaths for non-v1.0 plugins**: see "v1.0 plugin scope" above. The 13 deferred plugins ship across v1.1, v1.2, and v2.0 in mechanical follow-ups using the Module 4 adapter pattern.
- **Material and Tailwind example apps**. `examples/angular-material` and `examples/angular-tailwind` deferred to v1.x. The `angular-custom` example covers the headless story for v1.0; UI-library wrappers come once the API is locked.
- **Cross-framework code-tabs in docs**. The Angular section mirrors the existing per-framework structure (independent MDX trees, like `docs/vue/`); a unified "see in React/Vue/Svelte/Angular" tab component is its own initiative, not part of this PRD.
- **Cross-framework e2e parity**. Vitest browser mode covers Angular's quality gate. Hoisting a unified e2e harness to repo root and adding React/Vue/Svelte tests is its own initiative.
- **Angular Material adapter package** (e.g. `@embedpdf/angular-material` for sidenav/snackbar wiring). Considered for a later release.
- **`ng update` migration schematics**. The first version of the schematic only handles `ng add`; migration support waits until there's a breaking change worth migrating across.
- **NgModule support / pre-Angular-21 compatibility**. The peer range is `>=21.0.0`. Consumers on Angular ≤20 are not supported by these packages.
- **Rewriting the Wrapper viewer to use the headless layer internally**. The Wrapper continues to wrap `<embedpdf-container>` (the Snippet); rebuilding it on top of the headless components is a far larger project that loses Shadow-DOM style isolation and is not justified by v1.0's goals.
- **Observable APIs**. Consumers needing `Observable<T>` use `toObservable()` from `@angular/core/rxjs-interop`. No parallel observable surface.
- **Server-rendered PDFs**. Angular Universal renders an empty placeholder; the viewer mounts client-side. Pre-rendering server-side is a future possibility, not a v1.0 commitment.

## Forward-compatibility — v1.x roadmap

The 13 deferred plugins ship in mechanical follow-ups using the same Module 4 adapter pattern. Tentative grouping by feature affinity:

- **v1.1 — editing surface**: `plugin-{annotation,redaction,signature,stamp,plugin-ui}/angular`. The schema-driven `plugin-ui` lands here so consumers who want a Snippet-like declarative toolbar at the headless layer have one.
- **v1.2 — forms + navigation + history**: `plugin-{form,bookmark,attachment,history,capture,commands}/angular`. The Forms ↔ Signal Forms bridge: `injectForm(documentId, { schema? })` returns a Signal Forms `FormTree` whose model is auto-derived from the PDF's discovered AcroForm fields and bidirectionally synced with `FormCapability`. Signal Forms is production-ready in Angular 21+; no version block.
- **v2.0 — heavy / specialised**: `plugin-{ai-manager,layout-analysis,view-manager}/angular`.
- **v1.x examples**: `examples/angular-tailwind` and `examples/angular-material` once the API is locked.

## Further Notes

### Why this matters

Every quarter EmbedPDF loses a meaningful number of evaluators to Angular-native PDF libraries because the integration story is bad. Closing this gap unblocks Angular shops that already chose React/Vue/Svelte sister apps to use EmbedPDF — and brings in net-new logo wins.

### Why headless-first ordering (with parallel Wrapper)

The original PRD ordered Wrapper-viewer first. The current order (headless first; Wrapper parallel-shippable) is better for three reasons:

1. **Validates the API earlier**. The Wrapper viewer is a thin wrapper around an existing Web Component; it can't surface design problems in the headless layer because it doesn't use it. Building the headless layer first, with the custom example as the proof-of-life, exposes API mistakes while they're still cheap to fix.
2. **Parallel shipping unblocks evaluators**. Because the Wrapper depends only on Phase A0+A1 (build mode + dts fix) and the existing Snippet, it can ship at any point during B–C — giving Angular shops *something* immediately while the headless work continues.
3. **Smaller tracer bullet**. Phase A0 + A + B is 9 packages; once they compile and render a PDF, every subsequent phase is mechanical layering.

### Risks to watch during implementation

1. **Bug #27 dts gap** — addressed by A0, but it's the highest-risk single item because it silently fails. Build-time validator is the safety net.
2. **Angular CLI esbuild worker bundling**. Verify in a real `ng build --configuration production` that dynamic imports of `@embedpdf/engines/pdfium-worker-engine` produce a separate chunk loadable by the Web Worker constructor. If not, document the workaround.
3. **AnalogJS plugin lag behind Angular minor releases**. Pin the version in `@embedpdf/build`, smoke-test against a fresh `ng new` app on each Angular minor bump.
4. **Web Component upgrade timing under strict CSP**. Some `'unsafe-eval'`-free CSPs reject the snippet's bundled minifier output. Document CSP requirements early.
5. **Two-registry mistake**. `<embedpdf-provider>` nested inside a `provideEmbedPdf()` scope must throw clearly; lint-rule or runtime check, not silent duplication.
6. **`Scroller` virtualization timing**. The Svelte component owns layout and uses `setLayoutReady` after `$effect.pre`. Angular equivalent calls it from `effect()` — fine because `setLayoutReady` does not read DOM. Document the reasoning in the B3 implementation plan to avoid future contributors translating word-for-word into `afterNextRender`.
7. **Vitest browser mode flake**. Browser-mode tests are slower and occasionally flaky on first introduction. CI path-filtering keeps the blast radius contained; flakes only affect Angular-touching PRs.

### Recommended rollout cadence

- Week 1: A0 (bug #27 + Vitest pipeline) lands. Heads-up Discussion drafted upstream.
- Week 2: Phase A (modules 2–3 + `bridgeScopeState`). Phase E (Wrapper) starts in parallel.
- Weeks 3–4: Phase B (six packages, mostly mechanical once A is stable).
- Week 5: Phase C (eleven packages, parallelisable across contributors).
- Week 6: Phase D (`angular-custom` example) — flushes out any final API issues. Phase E (Wrapper) lands if not already done.
- Week 7: Phase F (schematic — both flows) + Phase G (docs incl. migration page).
- Week 8: upstream PR `the-ult:feature/angular` → `embedpdf:main`.

This sequence assumes the upstream Discussion lands during Week 2 and gets an OK from maintainers before Week 3 starts.
