# Upstream PR draft — `feat(angular): initial Angular integration`

> **Status:** draft — body for the upcoming `the-ult:feature/angular → embedpdf:main` PR (issue #24). Not part of the upstream diff. Iterate freely.
>
> **Scrub before opening upstream:** `docs/` (this file, PRD, ADRs) are fork-internal scaffolding — strip from the PR. The rationale lives entirely in the PR body below.

---

**Suggested title:** `feat(angular): initial Angular integration — drop-in viewer, docs, and marketing landing`

---

## Why

I'm an Angular developer who recently went looking for a proper PDF viewer for a project. The leading option in the Angular ecosystem today is `ngx-extended-pdf-viewer` — it works, but it's a heavy wrap around PDF.js, doesn't match Angular 21 idioms (signals, zoneless, standalone, `inject()`), and has nothing like EmbedPDF's plugin architecture or the Snippet's batteries-included feature set.

Looking at the EmbedPDF source, the path to a proper Angular integration was clear: the existing framework adapters (`@embedpdf/{react,vue,svelte}-pdf-viewer`) are all thin wrappers around `viewers/snippet` adapted to their respective frameworks. There was no reason a similar Angular adapter couldn't exist — so I built one. Rather than keep it as a third-party package, contributing it back to the main repo seems like the right move: same maintenance surface, same release cadence, same docs site, same trust signal for Angular developers evaluating EmbedPDF.

This is the **initial Angular release** — a drop-in viewer covering the full Snippet feature set out of the box (annotation, redaction, signature, forms, search, AI, …), plus complete docs and a marketing landing. A **follow-up release** will add the headless tier (`@embedpdf/core/angular`, per-plugin `injectXxx()` helpers, layer components) once the API has been validated against real consumer usage of the drop-in viewer.

## TL;DR

| Surface          | Delivery                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| New package      | `@embedpdf/angular-pdf-viewer` — single standalone class, `<embedpdf-viewer>` selector. Same shape as `@embedpdf/{react,vue,svelte}-pdf-viewer`. |
| New examples     | `examples/angular-pdf-viewer/` (Playwright-tested demo), `examples/angular-tailwind/` (live-demo source for docs)                                |
| New docs         | 21 MDX pages under `website/src/content/docs/angular/` — same page list as `/docs/{react,vue,svelte}/`                                           |
| New landing      | `/angular-pdf-viewer` route + landing component, fuchsia/pink/violet accent matching the current Angular brand mark                              |
| New build mode   | `defineLibrary('angular')` in `@embedpdf/build` (AnalogJS Vite)                                                                                  |
| Homepage updates | `AngularIcon`, hero badge, Two-Ways-to-Integrate links, `CodeShowcase` Angular tab, Headless chip                                                |
| Tailwind config  | Minor extension (one new color shade, one default-restoring move) — also fixes pre-existing silent class drops in sibling landings               |

**Volume:** 91 commits, 156 files changed, +13,400 / −838 LOC.

## Scope

### Included in this release

- A drop-in viewer wrapping `viewers/snippet`, same shape as the existing React/Vue/Svelte adapters. Single `[config]` input, full Snippet feature set baked in.
- `provideEmbedPdfViewerConfig({...})` DI provider for cascading defaults across nested viewers (theme preference, etc.).
- Signal-based outputs (`init`, `ready`, `themechange`) plus signal-typed `container` and `registry` accessors. No RxJS bridging required.
- SSR-safe: server renders an empty placeholder, browser mounts in `afterNextRender`. `DestroyRef.onDestroy` cleanup.
- Complete docs: `introduction`, `getting-started`, `engine`, `customizing-ui`, `theme`, `security` + 13 plugin pages. Same page list as `/docs/{react,vue,svelte}/`.
- Marketing surface at parity with the existing per-framework landings.

### Deferred to a follow-up release

- **Headless tier** — `@embedpdf/core/angular`, `provideEmbedPdf`, `injectXxx()`, layer components (`<embedpdf-viewport>` / `<embedpdf-scroller>` / `<embedpdf-render-layer>` / `<ng-template embedpdfPage>`). The follow-up release will start with the minimum-viable-render plugin set (`document-manager`, `viewport`, `scroll`, `render`, `tiling`, `interaction-manager`), with viewing essentials (`zoom`, `pan`, `rotate`, `selection`, `search`, …) following.
- **`ng add` schematic** — `getting-started.mdx` covers the manual wiring until this lands.

### Out of scope (separate issues if/when there's demand)

- Angular Material variant of the landing page.
- Spartan/ng deeper showcase. (The logo appears in the UI-library row on the landing; nothing beyond that.)
- UI-library-specific examples (`examples/angular-material`, etc.).

The headless docs route ships as a _Coming soon_ placeholder pointing at the follow-up release. No aspirational `@embedpdf/core/angular` snippet appears in marketing copy — the API is allowed to drift before it ships.

---

## What ships — by area

### 1. `viewers/angular/` — `@embedpdf/angular-pdf-viewer`

The Angular adapter. Same shape as `@embedpdf/{react,vue,svelte}-pdf-viewer`: a thin wrapper around `viewers/snippet`. Single standalone class `PDFViewer` (selector `<embedpdf-viewer>`).

- `src/pdf-viewer.component.ts` — the component
- `src/pdf-viewer.config.ts` — config type + `provideEmbedPdfViewerConfig` DI provider
- `src/plugin-signals.ts` — `createPluginCapabilitySignal` / `createDocumentScopeSignal` helpers for advanced consumers reaching into the registry
- `src/index.ts` — barrel
- Tests: `pdf-viewer.component.spec.ts` (TestBed unit), `plugin-signals.spec.ts`, `smoke.browser.spec.ts` (vitest browser mode under Playwright)

Naming: **`class PDFViewer`** (not `PDFViewerComponent`). Cross-framework symmetry with `@embedpdf/{react,vue,svelte}-pdf-viewer`; Angular 21's style guide is also moving away from the `Component` suffix.

### 2. `examples/`

- `examples/angular-pdf-viewer/` — Playwright-tested demo app. Used as the conformance/lifecycle test fixture for `viewers/angular`.
- `examples/angular-tailwind/` — live-demo source for the docs and the landing-page mount. Imported by `useAngularMount` in `website/`.

Both follow the existing `examples/{react,vue,svelte}-pdf-viewer` shape.

### 3. `website/src/content/docs/angular/` — 21 MDX pages

Same page list as `/docs/{react,vue,svelte}/`. Written manually (no machine translation), Angular 21 idioms throughout (signals, `@if`/`@for`, standalone, `inject()`, no `NgModule`, no `*ngIf`).

**Top-level (8):**

- `index.mdx`, `viewer/introduction.mdx`, `viewer/getting-started.mdx`, `viewer/engine.mdx`, `viewer/customizing-ui.mdx`, `viewer/theme.mdx`, `viewer/security.mdx`, `headless/introduction.mdx` (placeholder for the follow-up release)

**Plugin pages (13):**

- `viewer/plugins/plugin-{annotation,document-manager,export,form,i18n,pan,print,rotate,scroll,selection,signature,spread,zoom}.mdx`

A dedicated docs-lint test (`website/src/__tests__/angular-helper-docs.test.ts`) sweeps every TS/TSX code block under `content/docs/angular/viewer/` and asserts that `createPluginCapabilitySignal` / `createDocumentScopeSignal` helpers are invoked (`name()`) before member access — catches the common copy-paste error of writing `docZoom?.zoomIn()` instead of `docZoom()?.zoomIn()` in published examples.

### 4. `website/` — marketing surface

- **Landing page** at `/angular-pdf-viewer` (`app/angular-pdf-viewer/page.tsx` + `components/angular-pdf-viewer.tsx`). Hero, integration paths, `CodeShowcase` Angular tab, **live demo bootstrapping the real Angular adapter** (not a React preview of it), UI library row (Angular Material + PrimeNG + Spartan/ng + Tailwind), Headless follow-up callout, plugin showcase, FAQ, CTA. Pink/fuchsia/violet accent matching the Angular brand mark.
- **Lazy-mount** of the Angular demo: the ~MB of `@angular/core` + `@angular/platform-browser` + `@angular/compiler` JIT chunks only download once the demo section enters the viewport (IntersectionObserver, 200px rootMargin). Above-the-fold paint pays no Angular cost.
- **Homepage updates** (`components/homepage.tsx`, `components/framework-icons.tsx`, `components/code-showcase.tsx`): new `AngularIcon` (current brand gradient, not the legacy red shield), Angular badge in hero "Works seamlessly with" row, Angular link in both Two-Ways-to-Integrate cards, Angular tab in `CodeShowcase` (filename `app.component.ts`, brand colors), 4th chip in `HeadlessSection`, `'angular'` cases in `SnippetSection.getDocumentationLink` / `getButtonText`.
- **Three new logos**: `AngularMaterialLogo`, `PrimeNGLogo`, `SpartanNgLogo` in `components/logos/index.tsx`.

### 5. `packages/build/` — `defineLibrary('angular')`

New Angular build mode for `@embedpdf/build`'s `defineLibrary()` factory. AnalogJS Vite plugin (`@analogjs/vite-plugin-angular`) produces AOT-compiled FESM2022 (ESM + CJS) into `dist/angular/`. Adds `'angular'` to `FRAMEWORK_PREFIXES` in `validate-package-exports.ts` so the per-package exports-map check covers it.

Only `viewers/angular/` exercises this mode in this release. Per-plugin Angular adapters in the follow-up release will plug into the same mode without further build-system changes.

---

## How — locked decisions

Each decision below was previously documented in a fork-internal ADR. Folding the rationale into the PR description rather than introducing a `docs/adr/` tree to upstream — the trade-offs survive review better as bullets.

### Decision 1 — Publish via AnalogJS Vite, not `ng-packagr`

Each `@embedpdf/*` Angular bundle ships through a `'angular'` mode added to `defineLibrary()`, not via `ng-packagr` (the canonical Angular library publisher).

- **Single toolchain.** The Angular pipeline is a fifth `defineLibrary()` mode, not a parallel build system. No second workspace, no `ng build` runner, no Angular CLI dependency in CI.
- **Per-plugin Angular subpaths fit naturally.** Each plugin already runs `defineLibrary()` for `react`/`preact`/`vue`/`svelte`; adding a sixth costs one `vite build --mode angular` invocation per package.
- **Trade-off:** AnalogJS emits AOT-compiled FESM2022, not partial-Ivy APF. The Angular linker is a no-op on AOT bundles. For consumers on Angular ≤16 this would be a compatibility risk; this PR **locks the peer range to `>=21.0.0`** which makes the linker no-op the correct behavior.
- **Risk:** AnalogJS plugin sometimes lags Angular minor releases. Mitigation: pinned in `@embedpdf/build`, bumped only after smoke-testing.

Alternatives considered: ng-packagr secondary entry points (doubles per-plugin build time, breaks the every-package-looks-the-same symmetry, requires `@angular/compiler-cli` in every devDependency); separate Angular workspace (fragments the package graph permanently); `CUSTOM_ELEMENTS_SCHEMA` + Web Component (no TypeScript safety on config, no Signals integration).

### Decision 2 — Component API surface

- **Selector:** `<embedpdf-viewer>`. Name space cleanly separated from `viewers/snippet`'s `<embedpdf-container>`.
- **Class name:** `PDFViewer` (not `PDFViewerComponent`). Cross-framework symmetry; Angular 21 style guide is moving away from the suffix.
- **Inputs:** single `[config]` input typed as `PDFViewerConfig` — same flat shape consumers see in the existing per-framework docs. Cross-framework docs translate one-to-one.
- **Outputs:** signal-based — `init`, `ready`, `themechange` outputs + `container: Signal<EmbedPdfContainer | null>` + `registry: Signal<PluginRegistry | null>` accessors. No RxJS bridging required for `effect()` / `computed()` consumers.
- **Change detection:** `OnPush`. Zoneless-compatible.
- **Defaults DI:** `provideEmbedPdfViewerConfig({...})` lets app or route scope cascade defaults (theme preference, etc.) into every nested `<embedpdf-viewer>` without prop-drilling. Idiomatic Angular pattern (`provideRouter`, `provideHttpClient`, `provideStore`).

### Decision 3 — Bootstrap via `afterNextRender`, not eager factory

Defers all browser-API touches (engine creation, WASM fetch, `PluginRegistry` instantiation, store subscription wiring) to `afterNextRender`. The component returns immediately with placeholder signals; the actual bootstrap fires on the client only.

- **SSR-clean by construction.** Zero `isPlatformBrowser(...)` guards. The server platform sees null signals, the template renders its `@if (registry()) { … } @else { <loading /> }` branch, no browser-only API is reached. Works under Angular Universal without hydration mismatches.
- **Matches the cross-framework precedent.** Svelte bootstraps inside `$effect`; Vue inside `onMounted`; `afterNextRender` is the closest Angular analog. Same lifecycle ordering across frameworks.
- **Cooperates with zoneless change detection.** First-class hook; signal updates inside the callback trigger normal CD.
- **Cleanup:** `DestroyRef.onDestroy(() => registry()?.destroy())`. Route changes don't leak workers or WASM memory.
- **Trade-off:** one frame of `registry() === null` on the client. Consumers must render a loading state — but they'd need it for `pluginsReady` anyway.

Alternatives considered: eager bootstrap gated by `isPlatformBrowser` (race conditions between bootstrap and first `injectRegistry()` read); lazy on first read (order-dependent side effects, debugging nightmare); module-level singleton (Svelte-style — can't host two viewers in one app, fights Angular DI).

### Decision 4 — Headless registry shape (preview, lands in follow-up release)

When the headless tier lands in the follow-up release, the `PluginRegistry` context will be exposed via two parallel surfaces:

```ts
// Primary — provider function (idiomatic Angular)
bootstrapApplication(App, { providers: [provideEmbedPdf({ engine, plugins })] });

// Secondary — component for inline / per-instance scoping
<embedpdf-provider [engine]="engine" [plugins]="plugins"> … </embedpdf-provider>
```

Both resolve the same `PLUGIN_REGISTRY` `InjectionToken`. Deliberately diverges from the other framework adapters (which expose only a Provider component) because Angular has a route-scoped DI primitive that React/Vue/Svelte don't.

**Not in this PR** — flagging it here so reviewers can object to the shape before the follow-up PR lands. Happy to iterate.

### Decision 5 — Angular version baseline: `>=21.0.0`

Locked peer range. Justified by:

- AnalogJS Vite emits AOT-compiled FESM2022 (no linker needed for Angular ≥21).
- `afterNextRender` (Angular 16+, hardened in 17+) is core to the bootstrap strategy.
- Standalone components and `inject()` are the only supported authoring model — `NgModule` and constructor injection are not used anywhere in the new code.
- Zoneless support is first-class in Angular 21+; this PR's signal-only API surface assumes zoneless.

Angular consumers on `<21` are explicitly unsupported. Migration path: upgrade Angular, then install `@embedpdf/angular-pdf-viewer`. The `viewers/snippet` Web Component fallback (`<embedpdf-container>` + `CUSTOM_ELEMENTS_SCHEMA`) remains available on any Angular version for shops that can't upgrade.

### Decision 6 — Tailwind config touch-up (cross-cutting, minimal)

Two changes in `website/tailwind.config.ts`:

- `theme.extend.colors.gray.950: '#030712'` — adds a dark shade used by the follow-up-release callout's fake-terminal background.
- `theme.letterSpacing` moved from `theme` root to `theme.extend` (keeps custom `tight: -0.015em` and `wider: 0.05em` as overrides; restores Tailwind's defaults for `tighter`/`normal`/`wide`/`widest`).

The letterSpacing move is technically out of strict scope but **fixes pre-existing silent class drops** across the site: `tracking-wide` was used in 24 files (sibling React/Vue/Svelte landings + docs code-examples) and was silently dropping at build time because the root-level `letterSpacing` override only defined `tight`. Moving under `extend` is a one-line fix; doing the audit separately would mean opening a parallel docs-only PR.

`theme.fontSize` is **left untouched** at theme root — the truncated 10-step scale appears deliberate (caps marketing typography at `6xl`). Flagged here in case you want to expand it later.

---

## Testing

| Layer                | Tooling                              | Location                                                      |
| -------------------- | ------------------------------------ | ------------------------------------------------------------- |
| Unit                 | Vitest (node)                        | `viewers/angular/src/plugin-signals.spec.ts`                  |
| Component (TestBed)  | Vitest browser mode                  | `viewers/angular/src/pdf-viewer.component.spec.ts`            |
| Smoke (real browser) | Vitest browser mode under Playwright | `viewers/angular/src/smoke.browser.spec.ts`                   |
| Integration          | Playwright                           | `examples/angular-pdf-viewer/`                                |
| Docs lint            | Node test runner                     | `website/src/__tests__/angular-helper-docs.test.ts`           |
| Marketing            | `next build` + Playwright            | `examples/angular-tailwind/` mounted at `/angular-pdf-viewer` |

Conformance fixes from the PR #34 cycle ensure lifecycle ordering (`init` before consumer effects, `ready` after `pluginsReady`, `themechange` from the actual Snippet event, no leaks on `DestroyRef`).

CI matrix exercises Node 20 + Node 22. `pnpm --filter @embedpdf/angular-pdf-viewer test` runs end-to-end.

## Consumer impact

- **Net new for Angular consumers.** New optional peer dependency (`@embedpdf/angular-pdf-viewer`).
- **Zero breaking changes** for React, Vue, Svelte, or Web Component consumers. No public API on existing packages was modified.
- **Bundle size impact** on the website is gated behind IntersectionObserver — only fires when a user scrolls to the live demo on `/angular-pdf-viewer`.

## Follow-ups (separate PRs, deliberately scoped out here)

- **Headless tier.** `@embedpdf/core/angular` + `provideEmbedPdf` + `injectXxx()` helpers + minimum-viable-render layer components (`<embedpdf-viewport>`, `<embedpdf-scroller>`, `<embedpdf-render-layer>`, `<ng-template embedpdfPage>`). Six plugins to start: `document-manager`, `viewport`, `scroll`, `render`, `tiling`, `interaction-manager`. End-to-end `examples/angular-custom` demo.
- **Viewing-essentials plugin adapters.** Eleven adapters once headless lands: `zoom`, `pan`, `rotate`, `selection`, `search`, `spread`, `thumbnail`, `fullscreen`, `i18n`, `print`, `export`.
- **`ng add` schematic.** Optional follow-up; until then, `getting-started.mdx` walks consumers through the manual wiring.

## Notes for reviewers

- Most of the diff is **new files under `viewers/angular/`, `examples/angular-*/`, and `website/src/content/docs/angular/`**. Existing files touched are limited to: `packages/build/src/vite/index.ts` (new `'angular'` mode), `packages/build/src/vite/validate-package-exports.ts` (one constant), `website/src/components/homepage.tsx` + `framework-icons.tsx` + `code-showcase.tsx` (Angular tab + chips + badge), `website/src/components/logos/index.tsx` (three new logos), `website/tailwind.config.ts` (two-line extension).
- The Angular adapter does not import from `@embedpdf/core` directly — it wraps `viewers/snippet`, same as the existing framework adapters. No headless coupling. This release is shippable without the headless tier landing.
- The new package's `peerDependencies` list `@angular/core`, `@angular/common`, `@angular/platform-browser` at `>=21.0.0`. No `rxjs` runtime usage — all reactivity is signals.
- If you'd prefer an RFC Discussion before the merge review starts, happy to open one — the _Why_ and _How_ sections above are the content.

---

<details>
<summary><strong>File-level summary (collapsed)</strong></summary>

```text
NEW
  viewers/angular/                                — 17 files, ~1,800 LOC (incl tests)
  examples/angular-pdf-viewer/                    — Playwright demo app
  examples/angular-tailwind/                      — 5–7 demo source files (used by docs + landing)
  website/src/content/docs/angular/               — 21 MDX pages (~6,000 LOC including code blocks)
  website/src/content/docs/angular/code-examples/ — use-angular-mount.tsx + per-demo wrappers
  website/src/app/angular-pdf-viewer/page.tsx     — landing route
  website/src/components/angular-pdf-viewer.tsx   — landing component (~860 LOC)
  website/src/__tests__/angular-helper-docs.test.ts — docs-lint test
  website/src/components/logos/index.tsx          — +3 logo exports (AngularMaterial, PrimeNG, Spartan/ng)

MODIFIED
  packages/build/src/vite/index.ts                — new 'angular' mode
  packages/build/src/vite/validate-package-exports.ts — +'angular' in FRAMEWORK_PREFIXES
  website/src/components/homepage.tsx             — hero badge + paths links + chip
  website/src/components/framework-icons.tsx      — +AngularIcon
  website/src/components/code-showcase.tsx        — +'angular' framework + tab
  website/tailwind.config.ts                      — gray.950 + letterSpacing under extend
  website/src/app/angular-pdf-viewer/page.tsx     — was a redirect stub, now renders the landing

Stats: 91 commits, 156 files, +13,400 / −838 LOC.
```

</details>
