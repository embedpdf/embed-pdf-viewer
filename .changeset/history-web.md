---
'@embedpdf/web': minor
---

A layer's pictures stay valid until the next ones are shown: `createShownUrls()` makes one holder per layer, passed first to `loadAppearanceUrls(shown, …)` and `loadFieldPictureUrls(shown, …)`, and `release()`d when the layer goes. Cancelling a load drops only the URLs it hadn't shown, so a picture that shows again before the next set arrives (an annotation an undo brings back) is never a revoked URL. A load makes its URLs side by side, not one after another.
