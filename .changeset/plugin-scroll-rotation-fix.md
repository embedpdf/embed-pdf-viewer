---
'@embedpdf/plugin-scroll': patch
---

Fixed scroll calculations to account for page intrinsic rotation:

- Updated `getSpreadPagesWithSizes()` to compute effective rotation as `(pageRotation + docRotation) % 4` for each page
- Updated `scrollToPage()` to use effective rotation when calculating scroll position
- Updated `getRectPositionForPage()` to use effective rotation when provided rotation is undefined
- Fixed `calculatePageVisibility()` in base strategy to account for horizontal centering offset
