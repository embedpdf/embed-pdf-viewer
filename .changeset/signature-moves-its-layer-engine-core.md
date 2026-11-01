---
'@embedpdf/engine-core': patch
---

`EngineErrorCode.StaleBase` is gone. A signature no longer moves the document, so no layer is ever behind it and every layer can sign over its own base.
