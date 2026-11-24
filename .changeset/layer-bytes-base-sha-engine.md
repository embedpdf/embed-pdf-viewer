---
'@embedpdf/engine': patch
---

`engine.open({ kind: 'layerBytes', baseSha256 })` forwards the hash to the worker the way `layerFile` always has, so a caller that already verified the base's SHA-256 saves the runtime a full pass over the file on the first layer mutation.
