---
'@embedpdf/utils': patch
---

Fixed resize handle cursors to account for page rotation:

- Updated `diagonalCursor()` function to swap `ns-resize` and `ew-resize` cursors for edge handles (n, s, e, w) on odd rotation values (90° and 270°)
- Reorganized cursor logic to handle edge handles separately from corner handles

Previously, edge resize handles showed incorrect cursors on rotated pages (e.g., north handle showed `ns-resize` instead of `ew-resize` on 90° rotated pages).
