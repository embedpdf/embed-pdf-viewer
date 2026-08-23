---
'@embedpdf/react': patch
---

Give every Stage lens and standalone `PageView` a stable view identity and use its scoped tile handle. Thumbnail and secondary views can no longer clear the main view's high-resolution tiles.
