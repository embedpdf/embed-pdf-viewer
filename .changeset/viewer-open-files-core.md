---
'@embedpdf/core': minor
---

The documents capability has `canOpenFiles()`: whether `open()` can open a file from the user's computer (its bytes, or a URL the viewer downloads). It is the engine's `canOpenFiles`, so it's `true` with the local engine and `false` with the cloud engine. The test context's documents answer `false`, since they open nothing.
