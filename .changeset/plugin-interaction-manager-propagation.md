---
'@embedpdf/plugin-interaction-manager': minor
---

Added `stopImmediatePropagation()` and `isImmediatePropagationStopped()` methods to pointer events via the new `EmbedPdfPointerEventExtensions` interface. This allows higher-priority handlers to prevent lower-priority handlers from activating for the same event. Updated `mergeHandlers` to respect propagation state and stop calling handlers when propagation is stopped. Refactored `EmbedPdfPointerEvent` as a generic type that combines native events with extensions.
