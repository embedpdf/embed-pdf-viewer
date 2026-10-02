---
'@embedpdf/vue': minor
---

Add the stamp, measurement and redaction entry points to `@embedpdf/vue`.

- `@embedpdf/vue/stamp`: `useStamp()`, `useStampState()` (`armedAsset` as a ref), `useStampSettings()` and `useStampEvent()`. `useStampLibraries(filter?)` and `useStampAssets(filter?)` are the libraries and their stamps as refs, and take a getter for a filter that changes (`useStampAssets(() => ({ libraryId: props.libraryId }))`). `useStampAssetPreviewUrl(assetId)` is an image URL for a stamp's preview, as a ref, revoked when the asset changes or the component unmounts. `indexedDbByteStore` keeps libraries in the browser between visits, with `persistStampLibraries` and `restoreStampLibraries`.
- `@embedpdf/vue/measurement`: `useMeasurement()`, `useMeasurementState()`, `useMeasurementSettings()` and `useMeasurementEvent()`. `usePageScale(page)` is a page's scale as a ref (`null` for a `null` page), and `useMeasurementReadout(ref)` a measurement's `{ kind, value, label }`; both take a getter to follow a prop.
- `@embedpdf/vue/redaction`: `useRedaction()`, `useRedactionState()` (`pendingCount`, `applying` and `lastResult` as refs), `useRedactionSettings()` and `useRedactionEvent()`. `usePendingRedactions(filter?)` is the marks waiting to be applied, or one page's, as a ref.

Each entry re-exports its plugin, so `stampPlugin()` comes from the same import as `useStamp()`. Every composable works before a document opens.
