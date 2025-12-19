---
'@embedpdf/plugin-scroll': minor
---

Added `pageNumber` and `totalPages` properties to `LayoutReadyEvent`. This allows consumers to get the current page information immediately when the layout becomes ready, without needing to subscribe to a separate `onPageChange` event.
