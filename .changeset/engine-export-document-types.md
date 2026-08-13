---
'@embedpdf/engine': patch
---

Export the shared document types (`OpenInput`, `OpenOptions`, `DocumentHandle`, `PageHandle`, `DocumentCapabilities`, `TokenSource`, …) from the package root, mirroring `@cloudpdf/engine`, so code driving the engine directly can name them without importing from the transitive `@embedpdf/engine-core` dependency.
