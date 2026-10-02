---
'@embedpdf/vue': patch
---

Fix what `@embedpdf/vue` gives an app that installs it from npm. A `require` now finds CommonJS types (a `.d.cts` next to each `.cjs`); before, its types were read as ES modules, so a CommonJS project's imports were typed wrong. The declarations' own imports name their files (`./stage/scope.js`), so TypeScript's `node16` and `nodenext` resolution can follow them; before, every entry but `page-edit` failed there. `useRedactionState()` and `useSignatureState()` no longer name a package `@embedpdf/vue` doesn't depend on in their types (the engine's), which a strict installer like pnpm doesn't link.
