---
'@cloudpdf/contract': minor
---

Share links say whose layer their visitors write into. `layerMode` is `'shared'` (one layer, `layerName`, as before) or `'per-visitor'` (each visitor gets a layer of their own, and `layerName` is `null`), with `keepVisitorLayers` and `visitorLayerIdleSeconds` (an hour to 30 days) for per-visitor links. `shares.create` and `shares.update` take all of them, so a link can switch modes and keep its token. The exchange takes `visitorHandle` and `restart`, and answers `layerMode` and `visitor: { handle, keep }`: send the handle back to stay the same visitor, and keep it for the next visit when `keep` is true.
