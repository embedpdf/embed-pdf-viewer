# PRD — Angular integration

> **Status**: Draft, ready for upstream discussion
> **Date**: 2026-05-09 (revised: scope re-cut — v1.0 = drop-in Wrapper viewer; Headless tier defers to v1.1+. Previous "headless-first" plan reframed as v1.1 / v1.2.)
> **Domain context**: [`CONTEXT.md`](../../CONTEXT.md)
> **Related ADRs**:
> - [0001 — Angular packages publish via AnalogJS Vite, not ng-packagr](../adr/0001-angular-publishing-via-analogjs-vite.md)
> - [0002 — Angular Headless registry context: provider primary, component secondary](../adr/0002-angular-headless-registry-via-provider-function.md)
> - [0003 — Angular Headless bootstrap via `afterNextRender`, not eager factory](../adr/0003-angular-headless-bootstrap-via-after-next-render.md)

## Problem Statement

Angular developers cannot consume EmbedPDF the way React, Vue, and Svelte developers can. Today they have three options, all bad:

1. Use `<embedpdf-container>` directly with `CUSTOM_ELEMENTS_SCHEMA`. Works, but loses TypeScript safety on the config object, has no Signals integration, can't participate in Angular Forms, and feels nothing like Angular code.
2. Wrap a React component inside an Angular shell with one of the React-in-Angular adapters. High overhead, ships React + Preact in the bundle, no zoneless support.
3. Re-implement the viewer from scratch on top of `@embedpdf/core` directly. Requires deep knowledge of the plugin architecture and only the boldest teams attempt it.

A senior Angular developer evaluating PDF libraries today picks `ngx-extended-pdf-viewer` or a commercial product because there is no first-party EmbedPDF integration that respects Angular 21 idioms (signals, zoneless, standalone, `provideXxx`, modern style guide).

## Solution

Ship a two-tier Angular integration in two releases:

- **v1.0 — Drop-in Wrapper viewer.** `@embedpdf/angular-pdf-viewer` exporting a single standalone `PDFViewer` component (selector `<embedpdf-viewer>`) that wraps the EmbedPDF Snippet's Web Component. One import, one tag, one `config` input. Drop-in consumers get the **full Snippet feature set on day one** — annotation, redaction, signature, forms, search, AI, etc. — because the Snippet bakes every plugin in internally. Plus full Vue/Svelte-shaped docs at `website/src/content/docs/angular/viewer/*` and a marketing landing at `website/src/app/angular-pdf-viewer/`. v1.0 is the upstream-publishable "Angular shop can use EmbedPDF today" deliverable.

- **v1.1 — Headless Foundation.** `@embedpdf/core/angular` and `@embedpdf/engines/angular` plus the six minimum-viable-render plugin adapters (`document-manager`, `viewport`, `scroll`, `render`, `tiling`, `interaction-manager`). Angular consumers configure the registry via `provideEmbedPdf({ engine, plugins })` at app or route scope (idiomatic Angular, like `provideRouter`), then read state via `injectXxx()` injection-context functions returning Signals. Layer components like `<embedpdf-viewport>`, `<embedpdf-scroller>`, `<embedpdf-render-layer>` slot into custom layouts. A `<ng-template embedpdfPage let-page>` directive carries the per-page render context (Angular's idiomatic translation of Svelte's `renderPage` snippet / React's render-prop). End-to-end `examples/angular-custom` proof-of-life example with a floating toolbar.

- **v1.2 — Headless Essentials.** The 11 viewing-essentials plugin adapters: `zoom`, `pan`, `rotate`, `selection`, `search`, `spread`, `thumbnail`, `fullscreen`, `i18n`, `print`, `export`. Read-only headless parity with Vue/Svelte/React.

- **v1.x — beyond.** Editing surface (annotation, redaction, signature, stamp, plugin-ui), forms (Forms ↔ Signal Forms bridge), bookmark/attachment/history/capture/commands, AI/layout-analysis/view-manager.

Angular shops get a **batteries-included drop-in viewer immediately** (v1.0), and headless customisation arrives in subsequent point releases without blocking adoption.

## Why this re-cut (was: headless-first)

The original PRD ordered the Headless layer first ("validate the API earlier; Wrapper parallel-shippable"). The re-cut to **Wrapper-v1.0-first** is driven by three observations after the early PR work:

1. **The Wrapper is 95% built already.** PR #34 lands a working `@embedpdf/angular-pdf-viewer` (lifecycle-correct, Playwright-tested, with a `provideEmbedPdfViewerConfig` defaults pattern) on `feature/angular`. Pushing that out as v1.0 is a fast adoption win; holding it until the headless tier finishes adds months of delay for a deliverable that's already done.
2. **Headless API design benefits from real-world wrapper context.** Shipping the wrapper exposes how Angular shops actually consume EmbedPDF — what config they configure, what theming they want, where SSR pinch-points are. v1.1's headless API can absorb that learning.
3. **Smaller upstream PR is easier to review.** A 25-file Wrapper PR with docs is much easier for upstream maintainers to LGTM than a 17-package "complete Angular tier" PR. Reduces review friction and proves the upstream-merge process before the bigger v1.1 PR follows.

## v1.0 deliverable shape

Concrete artifacts that ship in the v1.0 upstream PR (`the-ult:feature/angular` → `embedpdf:main`):

| Slot | Source | Issue |
|---|---|---|
| `viewers/angular/` (`@embedpdf/angular-pdf-viewer`) | PR #34 + conformance fixes | #21, #34 |
| `examples/angular-pdf-viewer/` (Playwright demo + screenshots) | PR #34 | #34 |
| `examples/angular-tailwind/` (live-demo source for docs, 5–7 demos) | new in v1.0 docs PR | #23 |
| `website/src/content/docs/angular/viewer/*` (8 top-level + 13 plugin mdx pages, full Vue parity) | new in v1.0 docs PR | #23 |
| `website/src/content/docs/angular/headless/introduction.mdx` (placeholder linking to v1.1) | new in v1.0 docs PR | #23 |
| `website/src/content/docs/angular/code-examples/use-angular-mount.tsx` + per-demo wrappers | new in v1.0 docs PR | #23 |
| `website/src/app/angular-pdf-viewer/page.tsx` + landing component | new | #37 |
| Homepage Angular sections (hero, paths, CodeShowcase, headless chips) | new | #35, #36 |
| ADR 0001 / 0002 / 0003 | already on `feature/angular` | — |
| `defineLibrary()` `'angular'` mode + dts validator | already on `feature/angular` (A0 / #28) | — |

`ng add` schematic is **out of v1.0** — deferred to v1.0.x or v1.1. Manual setup steps in `getting-started.mdx` cover the same ground until the schematic ships.

## v1.0 plugin scope

The wrapper bakes in **every plugin** the Snippet ships with. Drop-in consumers get the full feature set on day one — annotation, redaction, signature, forms, AI, etc. — even though their per-plugin headless `/angular` adapters defer to v1.1+.

The v1.0 wrapper docs ship full pages for the 13 user-facing plugins consumers configure via the `config` object: `annotation`, `document-manager`, `export`, `form`, `i18n`, `pan`, `print`, `rotate`, `scroll`, `selection`, `signature`, `spread`, `zoom`. Mirrors `vue/viewer/plugins/` exactly.

## User Stories — by milestone

### v1.0 — Drop-in Wrapper

1. As an Angular developer evaluating PDF libraries, I want to install `@embedpdf/angular-pdf-viewer` and render a PDF in under five minutes with zero plugin choices, so that EmbedPDF beats my time-to-first-render bar before I evaluate features.
2. As an Angular developer, I want to import a single `PDFViewer` standalone class (selector `<embedpdf-viewer>`), so that I can drop it into any standalone-component app without an NgModule. The class name preserves cross-framework symmetry with `@embedpdf/{react,vue,svelte}-pdf-viewer`.
3. As an Angular developer, I want to pass the same flat `PDFViewerConfig` object I see in the React/Vue docs, so that cross-framework documentation translates one-to-one.
4. As an Angular developer with multiple wrappers in a single app, I want `provideEmbedPdfViewerConfig({ ... })` at app/route/component scope so that defaults like theme preference cascade into every nested `<embedpdf-viewer>` without prop-drilling.
5. As an Angular developer, I want signal-based outputs for `init`, `ready`, and `themechange` plus `container: signal<EmbedPdfContainer | null>` and `registry: signal<PluginRegistry | null>`, so that I can react to viewer lifecycle events and read state via `effect()` / `computed()` without RxJS bridging.
6. As an Angular SSR developer, I want the viewer to render an empty placeholder on the server and mount the actual viewer in the browser via `afterNextRender`, so that my app boots cleanly under Angular Universal without hydration mismatches.
7. As an Angular developer, I want the wrapper to clean up on `DestroyRef.onDestroy()`, so that route changes don't leak workers or WASM memory.
8. As an Angular developer reading `https://www.embedpdf.com/docs/angular/`, I want full viewer-tier docs at parity with `/docs/vue/viewer/*` (introduction, getting-started, engine, customizing-ui, theme, security + 13 plugin pages), so that I can adopt EmbedPDF without cross-referencing the Vue docs.
9. As a developer landing on `https://www.embedpdf.com`, I want Angular at parity in the hero, paths, CodeShowcase, and Headless callout sections, so that EmbedPDF's marketing surface treats Angular as a first-class supported framework.
10. As an Angular developer browsing `/docs/angular/headless`, I want a clear "Coming in v1.1" placeholder linking to the v1.1 milestone, so that I know headless is on the roadmap without waiting on undocumented APIs.

### v1.1 — Headless Foundation

11. As an Angular architect, I want to call `provideEmbedPdf({ engine, plugins })` inside a route's `providers` array, so that the engine and registry live for the route's lifetime and don't tear down on intra-route navigation.
12. As an Angular architect, I want to call `provideEmbedPdfEngine({...})` separately for advanced cases where one engine instance is shared across multiple registries, so that I can render multiple PDFs with separate plugin sets without re-downloading WASM.
13. As an Angular developer, I want a `<embedpdf-provider [engine] [plugins]>` standalone component as an alternative to the provider function, so that I can scope two viewers within the same component template (one engine each).
14. As an Angular developer, the `<embedpdf-provider>` component should detect a registry already in scope and refuse to create a duplicate, so that I can't accidentally double-bootstrap and waste a worker.
15. As an Angular developer, I want `injectPdfiumEngine({ wasmUrl, worker, fontFallback })` to return signals for engine, isLoading, and error, so that my UI can render loading and error states directly from the template.
16. As an Angular developer, I want `injectRegistry()`, `injectPlugin<T>(id)`, `injectCapability<T>(id)`, `injectActiveDocument()`, `injectDocumentStates()`, `injectCoreState()` returning signals, so that I can derive computed values reactively without manual subscriptions.
17. As a per-plugin adapter author, I want a single shared `bridgeScopeState(pluginId, documentId, initialState)` utility exported from `@embedpdf/core/angular`, so that every `inject*` hook is one mechanical call rather than 17 hand-written subscription bridges.
18. As an Angular developer following the getting-started guide, I want to register `DocumentManager`, `Viewport`, `Scroll`, `Render`, `Tiling`, and `InteractionManager` plugins and see a PDF render in my app, so that the tracer bullet works end-to-end before I add any chrome.
19. As an Angular developer evaluating EmbedPDF for a custom design system, I want a working `examples/angular-custom` app demonstrating a floating Adobe-style vertical toolbar over the headless viewer with v1.1 actions, so that I can copy the integration pattern without importing a UI library.
20. As an Angular developer reading `/docs/angular/headless/`, I want full headless docs at parity with `/docs/vue/headless/*` (introduction, getting-started, engine, full-example, security, understanding-plugins + per-plugin pages for shipped adapters), so that the headless tier is documented when it ships.

### v1.2 — Headless Essentials

21. As an Angular developer, I want `injectZoom(documentId)` returning `{ state, provides }` as signals, so that I can wire +, −, fit-page, fit-width, zoom-to-mode buttons in my own toolbar, plus `<embedpdf-marquee-zoom>` for drag-to-zoom-region UX.
22. As an Angular developer, I want `injectPan(documentId)`, `injectRotate(documentId)`, `injectSelection(documentId)` (with `<embedpdf-selection-layer>` projecting a selection-menu template), `injectSearch(documentId)` (with `<embedpdf-search-layer>`), `injectSpread(documentId)`, `injectThumbnail(documentId)`, `injectFullscreen(documentId)`, `injectI18n()`, `injectPrint(documentId)`, `injectExport(documentId)`, so that I can wire all read-only viewing actions in my own toolbar.

### v1.x — beyond v1.2

- Editing surface (`annotation`, `redaction`, `signature`, `stamp`, `plugin-ui`) — v1.3
- Forms ↔ Signal Forms bridge (`form`, plus `bookmark`, `attachment`, `history`, `capture`, `commands`) — v1.4
- Heavy / specialised (`ai-manager`, `layout-analysis`, `view-manager`) — v2.0
- UI-library examples (`examples/angular-material`, `examples/angular-tailwind` extended) — rolling

## Implementation Decisions

### Standard issue preamble (non-negotiable for every v1.1+ plugin issue)

Every B/C and headless-tier plugin issue body opens with a required review pass. The PRD does **not** spell out implementation specifics per plugin — those are derived by the implementer from the existing framework adapters during this preamble. The preamble:

> ## Before implementation — required review pass
>
> Do not start coding until this is done. Implementation choices should be derived from the existing framework adapters, not from the PRD or this issue body in isolation.
>
> 1. **Read the framework-neutral surface** — `packages/<this-plugin>/src/lib/`. Understand the capability, scope, state shape, store actions, and lifecycle hooks.
> 2. **Read the Svelte adapter** — `packages/<this-plugin>/src/svelte/`. Note hooks, components, snippets/render-props, effect ordering (`$effect` vs `$effect.pre`), cleanup, and any guards (stale-data, race conditions, scope re-resolution).
> 3. **Read the Vue adapter** — `packages/<this-plugin>/src/vue/`. Note differences from Svelte (refs vs runes, `watch` immediate, `onCleanup`, `MaybeRefOrGetter`).
> 4. **Read the React/Preact adapter** — `packages/<this-plugin>/src/react/` and `src/preact/`.
> 5. **Write a one-page implementation plan** as a comment on this issue covering:
>    - Mapping table: Svelte primitive → Angular 21 primitive (`$state` → `signal`, `$effect.pre` → `effect()`, `Snippet<[T]>` → `*embedpdfPage` structural directive, `bind:` → `model()` two-way, `dispatch` → `output()`).
>    - Where signal-based state is bridged via `bridgeScopeState` from `@embedpdf/core/angular`.
>    - SSR posture: which work goes inside `afterNextRender`, which is safe in `effect()`.
>    - Cleanup: `DestroyRef` wiring for every subscription returned by `scope.onStateChange`.
>    - Strict template type-check guards (`ngTemplateContextGuard`) for any structural directive.
>    - Tests: Node-mode Vitest for hooks, browser-mode Vitest (chromium) via `@analogjs/vitest-angular` for components.
> 6. **Get the plan ack'd** in the issue thread before opening the implementation PR.
>
> **Standards (Angular 21):** standalone-only (no `standalone: true` flag — it's the default), `OnPush`, signal inputs (`input()` / `input.required()` / `model()`), signal outputs (`output()`), no NgModules, no `Component` / `Service` / `Directive` / `Pipe` class suffixes (single exception: `PDFViewer` for cross-framework symmetry), `inject()` over constructor injection, `signal.asReadonly()` on every public-returned signal, `assertInInjectionContext` first line of every `injectXxx()` helper.

### Module 1 — `@embedpdf/build` `'angular'` mode (already shipped)

Extends `defineLibrary()` in the build preset with a fifth case alongside `react`/`preact`/`vue`/`svelte`. Inputs per consuming package are `src/angular/index.ts` and `src/angular/tsconfig.angular.json`. Output goes to `dist/angular/index.{js,cjs}` and emits typings via `unplugin-dts`. The mode loads `@analogjs/vite-plugin-angular` and externalizes `@angular/*`, `rxjs`, `tslib`, and the existing `@embedpdf/*` peer pattern. See [ADR 0001](../adr/0001-angular-publishing-via-analogjs-vite.md). A0 closed bug #27 (silently-skipped pure `export *` re-exports) and added a build-time validator.

### Module 5 — Wrapper viewer (`@embedpdf/angular-pdf-viewer`) — v1.0

Single standalone component, exported as the class **`PDFViewer`** (cross-framework symmetry — explicit exception to the Angular ALLCAPS-in-identifiers rule):

```ts
@Component({
  selector: 'embedpdf-viewer',
  template: '',
  styles: ':host { display: block; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PDFViewer {
  readonly config = input<PDFViewerConfig>({});
  readonly init = output<EmbedPdfContainer>();
  readonly ready = output<PluginRegistry>();
  readonly themechange = output<{ preference: ThemePreference; colorScheme: 'light' | 'dark'; theme: Theme }>();
  readonly container = signal<EmbedPdfContainer | null>(null);
  readonly registry = signal<PluginRegistry | null>(null);
  // ... afterNextRender mounting + DestroyRef cleanup ...
}
```

Mount lifecycle (per [ADR 0003](../adr/0003-angular-headless-bootstrap-via-after-next-render.md)):

1. `afterNextRender` calls `EmbedPDF.init({ type: 'container', target: hostElement, ...resolvedConfig })`.
2. Subscribes to the container's `themechange` custom event and forwards via the `themechange` output.
3. When `container.registry` resolves, sets `registry()` signal and emits `(ready)`.
4. `inject(DestroyRef).onDestroy()` removes the listener, empties the host element to trigger the Web Component's `disconnectedCallback`, and resets `container` / `registry` signals.

#### Default config DI — `provideEmbedPdfViewerConfig`

Locked in v1.0 alongside the wrapper component:

```ts
function provideEmbedPdfViewerConfig(config: PDFViewerConfig): EnvironmentProviders | Provider;
const EMBEDPDF_VIEWER_DEFAULT_CONFIG: InjectionToken<PDFViewerConfig>;
```

The wrapper resolves config via `mergeViewerConfigs(injected ?? null, this.config())`. App-scoped (`app.config.ts`), route-scoped (`Route.providers`), or component-scoped (`Component.providers`) — same pattern as `provideHttpClient` etc. Documented under `customizing-ui.mdx`.

The component depends only on `@embedpdf/snippet`. **It does not import any per-plugin `/angular` package**, so it's unaffected by the v1.x plugin scope. Drop-in consumers get the full Snippet feature set on day one — annotation, redaction, signature, forms, AI, etc. — even though those plugins' `/angular` headless adapters defer to v1.1+.

### Module 2 — `@embedpdf/core/angular` (v1.1)

Exports `provideEmbedPdf()`, `provideEmbedPdfEngine()` (re-export), `<embedpdf-provider>`, `injectRegistry()`, `injectPlugin<T>(id)`, `injectCapability<T>(id)`, document-state helpers (`injectActiveDocument`, `injectDocumentStates`, `injectCoreState`), **and the shared adapter utilities `bridgeScopeState` and `bridgeCoreSignal` consumed by every per-plugin `inject*` hook**. Both registry surfaces resolve a single private `EMBEDPDF_CONTEXT` `InjectionToken` so all `injectXxx` helpers consume the same registry regardless of how it was provided. See [ADR 0002](../adr/0002-angular-headless-registry-via-provider-function.md).

Full API contract locked in `CONTEXT.md` under "Angular integration" and the design grilling output. Implementation issue: #3.

### Module 3 — `@embedpdf/engines/angular` (v1.1)

Exports `provideEmbedPdfEngine()` and `injectPdfiumEngine({...})`. Dynamic-imports `@embedpdf/engines/pdfium-worker-engine` or `@embedpdf/engines/pdfium-direct-engine` based on `worker`. Returns `{ engine: Signal<PdfEngine | null>; isLoading: Signal<boolean>; error: Signal<Error | null> }`. Cleanup via `DestroyRef`. Implementation issue: #4.

### Module 4 — Per-plugin `/angular` adapter pattern (v1.1 + v1.2)

Each plugin shipped under `/angular` follows the same shape:

- `src/angular/index.ts` re-exports `inject*` helpers, layer components, and the base plugin's framework-neutral exports.
- `src/angular/inject-<name>.ts`: takes `documentId: Signal<string> | string | (() => string)`, returns `{ state: Signal<XxxDocumentState>; provides: Signal<XxxScope | null> }`. **Body is a single `bridgeScopeState` call.**
- Layer components mirror Svelte components in `packages/plugin-*/src/svelte/components/`. Signal inputs, content projection, `afterNextRender` mounting where needed.

Each plugin's package.json gains `"./angular": { types, import, require }` in the `exports` map. Each PR ships a `minor` bump changeset for that package. v1.1 covers 6 plugins (Phase B from the original plan); v1.2 covers 11 plugins (Phase C).

### Module 6 — `ng add` schematic (deferred to v1.0.x or v1.1)

Two flows planned. **Drop-in flow** (`ng add @embedpdf/angular-pdf-viewer`): install package + add PDFium WASM glob to `angular.json` `assets[]`. **Headless flow** (`--headless`, ships once v1.1's headless tier exists): also AST-modify `app.config.ts` to insert `provideEmbedPdf({ engine: { wasmUrl: '/assets/pdfium.wasm' }, plugins: [/* defaults */] })`. Both idempotent. Implementation issue: #22.

### Module 7 — Custom example (`examples/angular-custom`) — v1.1

Angular 21 application with no UI library. Single route. Floating vertical toolbar absolutely-positioned over the headless viewer; toolbar buttons styled with plain CSS. Uses only v1.1 / v1.2 deliverables. Composition mirrors the Svelte tracer (`<embedpdf-document-content>` → `<embedpdf-global-pointer-provider>` → `<embedpdf-viewport>` → `<embedpdf-scroller>` with `*embedpdfPage` template → `<embedpdf-rotate>` → `<embedpdf-page-pointer-provider>` → render/tiling/search layers). Toolbar actions wired through `injectZoom`, `injectRotate`, `injectSearch`, `injectThumbnail`, `injectFullscreen`, `injectI18n`, `injectPrint`, `injectExport`. Single Vitest browser-mode smoke test asserts the page mounts and a `<canvas>` appears.

### Module 8 — Test pipeline (already shipped via A0)

Vitest. Node mode for hooks/utilities, browser mode (chromium) via `@analogjs/vitest-angular` for standalone components and directives. Root `vitest.workspace.ts`, `test` task in `turbo.json`, `.github/workflows/test.yml`. Node-mode tests run on every PR; browser-mode tests path-filtered to PRs touching `packages/*/src/angular/**`, `viewers/angular/**`, or `examples/angular-*/**`.

**Playwright** is allowed for the v1.0 wrapper's e2e demo (`examples/angular-pdf-viewer/`) where Shadow-DOM-spanning real-browser testing genuinely benefits the wrapper. The previous "no Playwright in v1.0" rule is scoped to **headless v1.1+** packages — the headless tier has no Shadow DOM and Vitest browser-mode covers its test gap.

## Phase ordering

| Milestone | Scope | Notes |
|---|---|---|
| **Pre-flight (already done)** | Bug #27 fix in `defineLibrary()`; Vitest pipeline; revive dormant `packages/models/src/*.test.ts` | n/a — closed via A0 / #28, #33 |
| **v1.0 — Drop-in Wrapper** | `viewers/angular/` (#34 + #21), `examples/angular-pdf-viewer/` (#34), `examples/angular-tailwind/` + docs + landing + headless placeholder (#23, #37, #35, #36), upstream Discussion (#19), upstream PR (#24) | One upstream PR. Drop-in feature parity with Snippet-wrapper users on day one. |
| **v1.1 — Headless Foundation** | `@embedpdf/{core,engines}/angular` (#3, #4); `plugin-{document-manager,viewport,scroll,render,tiling,interaction-manager}/angular` (#5–#10); `examples/angular-custom` tracer (#11) and final (#20); full headless docs (#39); `ng add` schematic (#22) | Branched on `feature/angular-v1.1` for parallel work during v1.0 review. |
| **v1.2 — Headless Essentials** | `plugin-{zoom,pan,rotate,selection,search,spread,thumbnail,fullscreen,i18n,print,export}/angular` (#12–#18, #29–#32) | Parallelisable across contributors. |
| **v1.3+** | Editing surface; Forms ↔ Signal Forms; bookmark/attachment/history/capture/commands; AI/layout-analysis/view-manager; UI-library examples | Tentative; ordering TBD. |

## Locked technical decisions

| Area | Decision |
|---|---|
| Peer range | `@angular/core >=21.0.0` |
| Build | `@analogjs/vite-plugin-angular` via `defineLibrary()` `'angular'` mode |
| Reactivity | Signals only; consumers using observables call `toObservable()` themselves |
| Helper naming | `inject*()` — no parallel `use*()` aliases |
| Class naming | No `Component`/`Service`/`Pipe`/`Directive` suffixes; `Pdf` casing not `PDF` — single exception `PDFViewer` for cross-framework symmetry |
| Selector prefix | `embedpdf-` |
| Wrapper selector | `embedpdf-viewer` (class `PDFViewer`) |
| Standalone | Default per Angular 19+; do **not** add `standalone: true` flag |
| Render-prop equivalent | Structural directive `*embedpdfPage="let page"` with `ngTemplateContextGuard` |
| SSR | `afterNextRender` mounting; never touch browser APIs server-side (ADR 0003) |
| Modules | Standalone-only; no NgModules |
| Change detection | `OnPush` everywhere |
| Registry scoping | Angular DI per-injector — *not* a module-level singleton (deliberate divergence from Svelte; ADR 0002) |
| Wrapper default-config DI | `provideEmbedPdfViewerConfig({ ... })` + `EMBEDPDF_VIEWER_DEFAULT_CONFIG` token (v1.0) |
| Testing | Vitest unit + Vitest browser mode for packages; **Playwright allowed for the wrapper e2e demo** (`examples/angular-pdf-viewer/`); no Playwright in headless v1.1+ packages |
| Schematic | Two flows: drop-in (default, v1.0.x or v1.1) and `--headless` (v1.1+) |

## Branch & PR strategy

A long-running integration branch `feature/angular` lives on `the-ult/embed-pdf-viewer`. **All v1.0 implementation PRs target `feature/angular`.** PR #34 is the wrapper-package PR; #23 stacks the docs + landing + placeholder; #37 the marketing landing; #35/#36 the homepage updates.

**Parallel v1.1 work** lives on `feature/angular-v1.1`, branched off `feature/angular` *during* v1.0 review. v1.1 PRs (A2, A3, B1–B6, …) target this branch. File-tree overlap with v1.0 is essentially zero (`packages/*/src/angular/*` for v1.1 vs. `viewers/angular/*` + `website/*` for v1.0), so the rebase onto post-merge `feature/angular` is mechanical.

When v1.0 lands on `feature/angular` and the upstream Discussion (#19) has had its 48h soak, a **single upstream PR** opens from `the-ult:feature/angular` → `embedpdf:main` (#24). Once that merges, `feature/angular-v1.1` rebases and the v1.1 upstream PR follows the same pattern.

## Testing Decisions

A good test for this work exercises the **public API surface** the way a consumer would, asserts on **observable outputs** (signal values, emitted outputs, rendered DOM), and never reaches into private internals.

### Module 5 (v1.0) — Wrapper viewer

- **Vitest unit (`viewers/angular/src/pdf-viewer.component.spec.ts`)**: TestBed instantiation under zoneless. Assertions on signal-based `container`/`registry`/`themechange`, `(init)`/`(ready)`/`(themechange)` outputs, `provideEmbedPdfViewerConfig` merge correctness, `DestroyRef` cleanup.
- **Playwright e2e (`examples/angular-pdf-viewer/e2e/viewer.spec.ts`)**: real-browser test of the demo app — toolbar interactions inside the Web Component's Shadow DOM, theme toggle, config-panel toggles, smoke-render of a known PDF. Snapshot-asserts on visual stability.

### Module 2 (v1.1) — `@embedpdf/core/angular`

- `provideEmbedPdf({ engine: <fake>, plugins: [<fake plugin>] })` provides a registry that `injectRegistry()` returns once `pluginsReady()` resolves.
- `injectCapability<T>(id)` initially returns `provides: null`, then transitions to a non-null capability after the registry resolves.
- `<embedpdf-provider>` (browser mode) rendered within an outer `provideEmbedPdf()` scope throws when nested registry creation would conflict (two-registry detection).
- `bridgeScopeState` returns initial state immediately and re-bridges on `documentId` change.
- `DestroyRef` cleanup: tearing down the providing scope calls `registry.destroy()` exactly once.

### Module 4 (v1.1+) — `injectZoom` + `injectScroll` exemplar tests

If these two pass, the rest of the per-plugin adapters are mechanical. Tests cover initial state, post-resolve state, `documentId` change re-resolution, `DestroyRef` cleanup.

## Out of Scope

- **`/angular` subpaths for non-shipped plugins**: see "v1.0 plugin scope" + milestone tables.
- **Material and extra Tailwind example apps**. `examples/angular-material` and full `examples/angular-tailwind` plugin-by-plugin coverage deferred to v1.x.
- **Cross-framework code-tabs in docs**. The Angular section mirrors the existing per-framework structure (independent MDX trees); a unified "see in React/Vue/Svelte/Angular" tab is its own initiative.
- **Cross-framework e2e parity**. Playwright (v1.0 wrapper) + Vitest browser mode (v1.1+ headless) covers Angular's quality gate.
- **`ng update` migration schematics**. The first version of the schematic only handles `ng add`; migration support waits until there's a breaking change worth migrating across.
- **NgModule support / pre-Angular-21 compatibility**. The peer range is `>=21.0.0`.
- **Rewriting the Wrapper viewer to use the headless layer internally**. Wrapper continues to wrap `<embedpdf-container>`; rebuilding it on the headless tier is a far larger project that loses Shadow-DOM style isolation.
- **Observable APIs**. Consumers needing `Observable<T>` use `toObservable()` from `@angular/core/rxjs-interop`. No parallel observable surface.
- **Server-rendered PDFs**. Angular Universal renders an empty placeholder; the viewer mounts client-side.

## Forward-compatibility — v1.x roadmap

- **v1.3 — editing surface**: `plugin-{annotation,redaction,signature,stamp,plugin-ui}/angular`.
- **v1.4 — forms + navigation + history**: `plugin-{form,bookmark,attachment,history,capture,commands}/angular`. Forms ↔ Signal Forms bridge: `injectForm(documentId, { schema? })` returns a Signal Forms `FormTree` whose model is auto-derived from the PDF's discovered AcroForm fields and bidirectionally synced with `FormCapability`. Signal Forms is production-ready in Angular 21+.
- **v2.0 — heavy / specialised**: `plugin-{ai-manager,layout-analysis,view-manager}/angular`.
- **Examples**: `examples/angular-material`, full `examples/angular-tailwind` once the API is locked.
- **Schematic**: post-v1.0 enhancement covering the headless flow (#22 once v1.1 lands).
- **Auto-mount**: `*embedpdfAutoMount` structural directive (#38) when first consumer plugin needs it (post-v1.4).

## Further Notes

### Why this re-cut is the right call

The original PRD optimised for "validate the API earlier" — build headless first, then layer the wrapper. That's defensible if no wrapper exists yet. But the wrapper exists today (PR #34), polished beyond MVP, with a real Playwright-tested demo and a `provideEmbedPdfViewerConfig` ergonomics layer that emerged from real Angular usage patterns. Holding it for headless adds delay without changing the headless API design — wrapper code doesn't constrain headless code. Shipping v1.0 now closes the Angular adoption gap immediately and gives the v1.1 headless work real-world wrapper-context evidence to design against.

### Risks to watch during implementation

1. **`embedpdf-viewer` selector lock-in.** v1.0 publishes a public selector to upstream npm. Renaming later is a breaking change — apply Delta 1 from #21 *before* PR #34 merges.
2. **Angular CLI esbuild worker bundling.** Verify in a real `ng build --configuration production` that PDFium worker chunks load via the Web Worker constructor.
3. **AnalogJS plugin lag behind Angular minor releases.** Pin in `@embedpdf/build`, smoke-test against fresh `ng new` per Angular minor.
4. **Web Component upgrade timing under strict CSP.** Some `'unsafe-eval'`-free CSPs reject the snippet's bundled minifier output. Document CSP requirements in `customizing-ui.mdx`.
5. **Playwright snapshot drift.** v1.0's e2e uses chromium-darwin snapshots. CI must run on the same OS or regenerate; document snapshot maintenance in `examples/angular-pdf-viewer/README.md`.
6. **v1.1 rebase complexity.** `feature/angular-v1.1` rebases onto post-merge `feature/angular` once v1.0 ships. Keep v1.1 PRs out of `viewers/angular/`, `website/src/content/docs/angular/viewer/`, `website/src/app/angular-pdf-viewer/`, and `examples/angular-pdf-viewer/` — the rebase-overlap zone.

### Recommended rollout cadence

- Week 1 (current): #21 conformance fixes land on PR #34. PR #34 merges to `feature/angular`.
- Week 2: #23 docs + landing PR + #37 + #35/#36 land on `feature/angular`. `feature/angular-v1.1` branched.
- Week 3: #19 upstream Discussion fires; 48h soak. v1.1 work begins on the parallel branch (#3, #4 first).
- Week 4: #24 upstream PR opens. Maintainer review; merge.
- Week 5+: v1.1 development continues on `feature/angular-v1.1`. Rebase onto post-merge `feature/angular` once v1.0 lands upstream.
