# ADR 0002 — Angular Headless registry context: provider function primary, component secondary

- **Status**: Accepted
- **Date**: 2026-05-08
- **Deciders**: Arjen
- **Context**: Adding Angular integration tier to EmbedPDF; see [CONTEXT.md](../../CONTEXT.md).

## Decision

The Angular Headless layer establishes the `PluginRegistry` context via two parallel surfaces:

```ts
// 1. Primary — Angular-idiomatic provider function
provideEmbedPdf({
  engine: { wasmUrl: '/assets/pdfium.wasm', worker: true },
  plugins: [
    ZoomPluginPackage,
    ScrollPluginPackage,
    /* … */
  ],
});

// Used at app or route scope
bootstrapApplication(App, { providers: [provideEmbedPdf({ … })] });

// 2. Secondary — component for inline / per-instance scoping
@Component({
  imports: [EmbedpdfProvider],
  template: `<embedpdf-provider [engine]="engine" [plugins]="plugins"> … </embedpdf-provider>`,
})
```

Both surfaces resolve the same `PLUGIN_REGISTRY` `InjectionToken`. All `injectXxx()` helpers (`injectRegistry`, `injectPlugin`, `injectCapability`, per-plugin `injectZoom`, `injectScroll`, …) read from that token.

This deliberately diverges from the React/Vue/Svelte layer — those expose only an `<EmbedPDF engine plugins>` Provider component because their frameworks lack a route-scoped DI primitive.

## Consequences

### Positive

- Aligns with the canonical Angular publishing pattern: `provideRouter`, `provideHttpClient`, `provideStore`, `provideAnimations`. Angular consumers reach for `provideXxx()` first.
- Lets the registry live at route scope. Multi-route apps that reuse the engine across multiple PDF pages don't tear it down on every navigation.
- The component variant covers React/Vue refugees who want to write `<embedpdf-provider>...layers...</embedpdf-provider>` and the inline-scoping case (e.g. two side-by-side viewers in one component).
- `provideEmbedPdf({ engine: {...}, plugins })` accepts inline engine config so most apps stay one provider call.

### Negative / risks

- Two surfaces means two paths to test, two paths to document, two failure modes. Mitigation: both call into one shared `createRegistryProviders()` factory; the component just declares them on its own injector.
- Cross-framework docs ("the same code in every framework") get harder — Angular section will have a non-trivial deviation. Mitigation: lead Angular docs with `provideEmbedPdf` and footnote the component variant for parity-style migration.
- Consumers may mix both (provide at root, then nest a component) and create two registries unintentionally. Mitigation: the component throws at `afterNextRender` if it detects a registry already in scope and `overrideExisting: false`.

## Alternatives considered

### A. Provider function only

Smallest API surface, most idiomatic. **Rejected because** porting docs/code from React/Vue becomes harder ("where do I put `<EmbedPDF>`?"), and inline two-viewer scenarios require a workaround via `Injector.create`.

### B. Component only (mirror React/Vue exactly)

Cleanest cross-framework parity. **Rejected because** it can't be used in `Route.providers`, forcing every route-scoped engine to be re-bootstrapped on navigation. Fights against Angular DI conventions.

### C. NgModule with `forRoot`/`forChild`

The Angular ≤14 idiom. **Rejected because** Angular 21+ baseline (see ADR 0004 if/when written) standardizes on standalone components and `provideXxx`; NgModules are legacy.
