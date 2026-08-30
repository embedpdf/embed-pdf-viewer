---
'@embedpdf/core-geometry': minor
---

Clarify the public page transform API around content-space coordinates. Add
`toPixels` and `fromPixels`, and rename the display conversions to
`contentToView`, `contentToViewRect`, `viewToContent`, and
`viewToContentRect`.
