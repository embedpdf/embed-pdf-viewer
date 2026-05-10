# ADR 0001 — Angular packages publish via AnalogJS Vite, not ng-packagr

- **Status**: Accepted
- **Date**: 2026-05-08
- **Deciders**: Arjen
- **Context**: Adding Angular integration tier to EmbedPDF; see [CONTEXT.md](../../CONTEXT.md).

## Decision

Each `@embedpdf/*` package that needs Angular bindings ships an `'angular'` Vite mode added to `@embedpdf/build`'s `defineLibrary()`, using [`@analogjs/vite-plugin-angular`](https://analogjs.org/docs/guides/libraries). The mode produces an AOT-compiled FESM2022 bundle (ESM + CJS) into `dist/angular/` with the package's `exports` map gaining an `"./angular"` key — symmetric with the existing `react`/`preact`/`vue`/`svelte` modes.

We do **not** use [`ng-packagr`](https://github.com/ng-packagr/ng-packagr) (the canonical Angular library publisher).

## Consequences

### Positive

- Single toolchain. The Angular pipeline is a fifth `defineLibrary()` mode, not a parallel build system. No second workspace, no `ng build` runner, no Angular CLI dependency in CI.
- Per-plugin Angular subpaths fit naturally. Each plugin already runs `defineLibrary()` for five framework modes; adding a sixth costs one `vite build --mode angular` invocation per package.
- AnalogJS publishing recipe is documented and known-working, including the `peerDependencies` and `exports` shape Angular consumers expect.

### Negative / risks

- AnalogJS Vite emits **AOT-compiled** FESM2022, not the partial-Ivy APF that `ng-packagr` produces. The Angular linker (which converts partial-Ivy template factories to the consumer's compiled Ivy) becomes a no-op for our packages. For Angular ≥21 consumers this is fine — the linker is already a no-op for AOT bundles. For consumers on Angular ≤16 it would be a compatibility risk; we **lock peer range to `>=21.0.0`** (see CONTEXT.md) which sidesteps this entirely.
- AnalogJS plugin sometimes lags Angular minor releases by days/weeks. Mitigation: pin `@analogjs/vite-plugin-angular` in `@embedpdf/build`, bump only after smoke-testing against a fresh `ng new` app.
- Some Angular tooling (e.g. older Nx workspaces, internal corp registries that whitelist `metadata.json`) explicitly check for ng-packagr-style metadata. Consumers on those stacks have to use the Wrapper viewer's snippet-only mode or migrate.

## Alternatives considered

### A. ng-packagr secondary entry points

Add a `packages/<plugin>/angular/package.json` with `"ngPackage": {...}` per plugin and run `ng-packagr` per secondary entry. Produces canonical APF, partial-Ivy templates, the works.

**Rejected because:** introduces a second build system to the monorepo, doubles per-plugin build time, requires `@angular/compiler-cli` in every `@embedpdf/*` devDependency, and breaks the "every package looks the same" symmetry of `defineLibrary()`. The compatibility benefit is negligible for our locked Angular ≥21 peer range.

### B. Separate Angular workspace

Stand up `angular-workspace/` with one ng-packagr lib per Angular target, publish them as new top-level packages (`@embedpdf/angular-core`, `@embedpdf/angular-plugin-zoom`, …).

**Rejected because:** fragments the package graph. Angular consumers would import `@embedpdf/angular-plugin-zoom` while React consumers import `@embedpdf/plugin-zoom/react` — different surface, different docs, different release cadence. Permanent inconsistency for no real benefit.

### C. Status quo + document Web Component usage

Tell Angular consumers to use the existing `<embedpdf-container>` Web Component directly with `CUSTOM_ELEMENTS_SCHEMA`.

**Rejected because:** the user explicitly asked for a "proper" Angular integration with both Wrapper and Headless tiers; CUSTOM_ELEMENTS_SCHEMA loses type-safety on inputs/outputs, has no Signals integration, and gives Angular consumers a worse story than React/Vue/Svelte already have.
