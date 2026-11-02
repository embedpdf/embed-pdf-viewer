---
'@embedpdf/engine-services': patch
---

An `/XYZ` destination with a literal `0` zoom now reads as `zoom: 0` instead of `null`. Destinations are read through `FPDFDest_GetView` and the null-parameter mask for every view type, so only a `null` parameter reads as `null`; `FPDFDest_GetLocationInPage` reported a `0` zoom as absent.
