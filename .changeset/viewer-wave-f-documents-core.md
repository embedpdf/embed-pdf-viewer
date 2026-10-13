---
'@embedpdf/core': patch
---

`documents.retry(id)` opens a failed document again in its own tab: the tab keeps its id and its place, it shows `loading` at once, and the active document stays the active one. The tab no longer closes and comes back at the end, so `onClosed` and `onActiveChanged` don't fire for a retry.
