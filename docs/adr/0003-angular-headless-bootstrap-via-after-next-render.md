# ADR 0003 — Angular Headless bootstrap via `afterNextRender`, not eager factory

- **Status**: Accepted
- **Date**: 2026-05-09
- **Deciders**: Arjen
- **Context**: Adding Angular integration tier to EmbedPDF; see [CONTEXT.md](../../CONTEXT.md). Builds on [ADR 0002](./0002-angular-headless-registry-via-provider-function.md) which locked the dual provider-function + component surface.

## Decision

`provideEmbedPdf({...})`, `provideEmbedPdfEngine({...})`, and `<embedpdf-provider>` defer all browser-API touches — engine creation, WASM fetch, `PluginRegistry` instantiation, store subscription wiring — to **`afterNextRender`** rather than running them eagerly inside the provider factory.

Concretely, every provider's `useFactory` returns immediately with placeholder signals (`registry: signal<PluginRegistry | null>(null)`, `ready: signal(false)`, `coreState: signal<CoreState | null>(null)`) and registers an `afterNextRender(async () => {...})` callback that performs the actual bootstrap on the client only.

```ts
useFactory: () => {
  const registry = signal<PluginRegistry | null>(null);
  const ready = signal(false);
  const destroyRef = inject(DestroyRef);

  afterNextRender(async () => {
    const reg = new PluginRegistry(engine, opts.config);
    reg.registerPluginBatch(opts.plugins);
    await reg.initialize();
    // ... wire store subscription, await onInitialized, await pluginsReady ...
    registry.set(reg);
    ready.set(true);
  });

  destroyRef.onDestroy(() => registry()?.destroy());
  return { registry, ready, /* ... */ };
}
```

`afterNextRender` is a no-op on the server platform, so SSR renders the loading branch without ever reaching for `document`, `window`, or `fetch('pdfium.wasm')`.

## Consequences

### Positive

- **SSR-clean by construction.** Zero `isPlatformBrowser(...)` guards sprinkled through engine code. The server platform sees null signals, components render their `@if (registry()) { ... } @else { <loading /> }` loading branches, and no browser-only API is reached.
- **Matches the cross-framework precedent.** Svelte's `EmbedPDF.svelte` bootstraps inside `$effect` (post-mount). Vue's `embed-pdf.vue` bootstraps inside `onMounted`. `afterNextRender` is the closest Angular analog. A consumer reading the docs sees the same lifecycle ordering across frameworks: "registry is null until first render completes; non-null thereafter."
- **Predictable timing for `injectXxx()` consumers.** Every consumer sees the same "null-then-resolves" timeline regardless of where they're injected. The contract is "call `injectRegistry()`, get `Signal<PluginRegistry | null>`, render a loading branch when null." No surprises.
- **Cooperates with zoneless change detection.** `afterNextRender` is a first-class hook in zoneless apps; signal updates inside its callback trigger normal CD. No interop layer.
- **Single bootstrap path** for `provideEmbedPdf` and `<embedpdf-provider>`. Both surfaces register an `afterNextRender` with the same body shape; only the engine source (config-derived vs `[engine]`-input-derived) differs.

### Negative / risks

- **One frame of "registry is null"** on the client. Consumers must render a loading state while bootstrap completes — but this is the same loading state they'd need for `pluginsReady` anyway, so no extra burden.
- **No way to start WASM fetch before first paint.** Eager bootstrap could shave a frame off TTI for the PDF. We trade this for SSR-cleanness; if a future user demands eager fetch, we can add an opt-in `bootstrap: 'eager' | 'after-next-render'` flag without breaking the default.
- **Test fixtures need a render trigger.** Vitest Node-mode tests of helpers can use `provideTestRegistry({ registry, ready, ... })` (which short-circuits the bootstrap path entirely). Browser-mode tests use `TestBed`'s usual fixture rendering, which fires `afterNextRender` correctly.
- **`<embedpdf-provider>` lifecycle ordering**: the component's @Input bindings populate during change detection, AFTER constructor injection runs. The provider factory therefore can't read `engine()` synchronously; it must defer the read to inside the `afterNextRender` callback. This is the same pattern Angular itself uses for similar cases (e.g., `RouterOutlet`'s deferred view creation) — not a new constraint, just one to document for future B/C plugin component authors.

## Alternatives considered

### A. Eager bootstrap inside `useFactory`, gated by `isPlatformBrowser`

```ts
useFactory: () => {
  if (isPlatformBrowser(inject(PLATFORM_ID))) {
    // ... eager bootstrap here ...
  }
  // ...
}
```

- **Rejected because:** factory runs at injector construction (app bootstrap or route activation), which is *before* any component renders. WASM fetch starts earlier, which can be a win (faster TTI) — but it also means the engine is racing the consumer's component tree to `injectRegistry()` at first read, leading to non-deterministic test-vs-production behavior. The `isPlatformBrowser` guard adds a runtime branch in every provider factory across 17+ packages. Loses the single-pattern simplicity.

### B. Lazy on first read of `injectRegistry()`

Bootstrap fires only when a component actually calls `injectRegistry()` (or any other `injectXxx`).

- **Rejected because:** `injectXxx()` helpers sometimes have side effects, sometimes don't, depending on first-call ordering. A consumer that calls `injectActiveDocument()` before any other helper would trigger registry bootstrap; a consumer that calls them in a different order would not. Order-dependent side effects are a debugging nightmare. Also breaks the `injectRegistry()` returns `Signal<PluginRegistry | null>` contract (consumer can't rely on null-then-resolves; it might be null forever if no other component reads).

### C. Mirror Svelte's module-level singleton

Svelte's adapter uses `pdfContext` — a module-level `$state` object initialized once per import. Two viewers in one app would share state.

- **Rejected because:** can't host two viewers in one app, fights against Angular DI scoping (route-scoped engines, multi-tenant apps), and was already explicitly rejected in CONTEXT.md ("registry lives behind an `InjectionToken<PluginRegistry>` — *not* a module-level `$state` singleton — deliberate divergence from the Svelte adapter").
