---
'@embedpdf/engine-runtime': patch
---

Smaller and faster to start: the generated table of runtime function signatures is written compactly (each distinct parameter or result type once, each function as one line of indices) instead of as a nested object literal per parameter. The engine worker script shrinks by about 350 KB, and parsing and building the table no longer slows its start. No API change.
