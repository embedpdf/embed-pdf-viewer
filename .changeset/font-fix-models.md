---
'@embedpdf/models': patch
---

- Fix `StandardFontDescriptor.css` to use base family names only (not variant-specific like `"Helvetica-Bold"`).
- Add `StandardFontCssProperties` interface and `standardFontCssProperties()` for cross-platform font rendering with proper `fontWeight`/`fontStyle`.
