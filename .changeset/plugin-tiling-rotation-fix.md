---
'@embedpdf/plugin-tiling': patch
---

Fixed tile calculations to account for page intrinsic rotation:

- Updated `refreshTilesForPages()` to compute effective rotation as `(pageRotation + docRotation) % 4` for each page
- Updated `onScrollMetricsChange()` to use effective rotation per page when calculating tiles
