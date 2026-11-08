---
'@embedpdf/core': patch
---

The page list takes a page scale change's new layout from its event, and shows a pending one at once. The test context's pages can carry viewports, and a document event that moves them wakes the store's readers, as in the kernel.
