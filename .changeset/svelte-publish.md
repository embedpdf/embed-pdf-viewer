---
'@embedpdf/svelte': patch
---

Fix what `@embedpdf/svelte` gives an app that installs it from npm. Every relative import in the package names its file (`./search/readers.svelte.js`), so webpack, which doesn't guess extensions in an ES module package, and TypeScript's `node16` and `nodenext` resolution can follow them; before, only Vite-like bundlers could. The manifest no longer has a `svelte` field pointing at a source file that isn't published (the `svelte` export condition says it). `useRedactionState()` and `useSignatureState()` no longer name a package `@embedpdf/svelte` doesn't depend on in their types (the engine's), which a strict installer like pnpm doesn't link.
