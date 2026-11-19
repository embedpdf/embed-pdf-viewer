---
'@embedpdf/engine-runtime': patch
---

Ship only the declaration files the package exports. The package no longer includes a `.d.ts` for each internal source file (`dist/core/platform.d.ts` and nine more), which no export pointed to. `index.d.ts`, `index.d.cts`, `build-id.d.ts`, `build-id.d.cts` and every JavaScript file are unchanged.
