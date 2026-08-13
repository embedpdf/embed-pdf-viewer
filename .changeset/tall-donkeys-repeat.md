---
'@embedpdf/core': patch
---

Svelte: scope the PDF context per `<EmbedPDF>` instance

The Svelte adapter kept its context in a single module-level `$state` object shared by every consumer on the page, so two `<EmbedPDF>` instances overwrote each other's `registry`, `coreState` and `activeDocumentId`, and unmounting either one reset both. Each instance now creates its own context and publishes it with `setContext`, matching how the React, Preact and Vue adapters already scope theirs.

`usePlugin` now resolves through `useRegistry()` instead of importing the module object directly, as the other adapters do.

Behaviour changes to be aware of:

- Components that call `useRegistry()`, `useCoreState()` or `usePlugin()` with no `<EmbedPDF>` ancestor used to reach the global object and work by accident. They now receive an inert read-only fallback (`registry: null`) and a console warning on every resolution.
- Those three hooks must be called during component initialization, as `getContext` requires. `useCapability` already had this constraint through its internal `$effect`.
- The deprecated `pdfContext` export still resolves, but it is now frozen: nothing writes to it, and writes to it throw instead of silently leaking into other consumers.

The context key is registered with `Symbol.for`, so accidentally bundling two copies of `@embedpdf/core` still resolves one shared key.
