---
'@embedpdf/react': minor
---

The stamp hover ghost is rendered at the on-screen device pixel size and re-requested when the zoom crosses a size bucket, so large vector stamps stay sharp. `@embedpdf/react/stamp` additionally re-exports `indexedDbByteStore` and `ByteStore` from `@embedpdf/web`, the browser store for `persistStampLibraries` / `restoreStampLibraries`.
