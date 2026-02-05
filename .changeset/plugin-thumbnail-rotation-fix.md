---
'@embedpdf/plugin-thumbnail': patch
---

Fixed thumbnail rendering to account for page intrinsic rotation:

- Updated `rebuildLayout()` to swap width/height for pages with 90° or 270° rotation when calculating thumbnail dimensions
- Added `rotation: page.rotation` to render options in `renderThumb()` to ensure thumbnails display with correct orientation
