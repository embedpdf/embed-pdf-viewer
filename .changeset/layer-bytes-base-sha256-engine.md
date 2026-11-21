---
'@embedpdf/engine': patch
---

`open({ kind: 'layerBytes', baseSha256 })` now passes the caller's verified base hash to the runtime, so the first layer mutation does not read the whole base document again.
