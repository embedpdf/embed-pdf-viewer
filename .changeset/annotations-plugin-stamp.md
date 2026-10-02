---
'@embedpdf/plugin-stamp': minor
---

`placeAsset()` and `placeAssetOnPages()` put the stamp's middle on `center` (was `at`) and take a page as a ref or an index; a placement from code is selected only with `select: true`. Arming and placing go through the annotation plugin's `stamps` (`arm`, `isArmed`, `place`, `disarm`).
