---
'@embedpdf/angular': minor
---

Stamps, measurements and redaction in Angular: `@embedpdf/angular/stamp`, `/measurement` and
`/redaction`. Each entry re-exports its plugin, so registration travels with the UI.

- `withStamp(options)` and `inject(EpdfStamp)`: the Stamps page's methods (`importLibrary()`,
  `createAsset()`, `armAsset()`, `placeAsset()`, …), the armed stamp as `armedAsset()`, the events
  as streams (`libraryChanged$`, `armChanged$`, …) and the settings. The libraries are
  `libraries()`, one library's stamps `assetsOf({ libraryId })`, and a stamp's picture
  `previewUrlOf(id)`, an image URL that follows the stamp and a picture that arrives later, and is
  released with the component that asked for it. `assetsOf()` and `previewUrlOf()` take a value
  or a function that reads signals. `persistStampLibraries(stamp, store)` and
  `restoreStampLibraries(stamp, store)` take the service, and `indexedDbByteStore()` is the
  browser's store for them.
- `withMeasurement(options)` and `inject(EpdfMeasurement)`: the scales, calibration and
  measuring, `busy()`, `calibrationRequest()` and `lastReports()` as signals, a page's scale as
  `scaleOf(page)` and a measurement's `{ kind, value, label }` as `readoutOf(ref)`, the events
  as streams (`scaleChanged$`, `calibrationRequested$`, …) and the settings.
- `withRedaction(options)` and `inject(EpdfRedaction)`: marking, applying, `pendingCount()`,
  `applying()` and `lastResult()` as signals, the marks waiting as `pending()` and one page's as
  `pendingOn(page)`, the checks (`canApply()`, `canUnmark(ref)`, …), which follow the document
  in a template, `applied$` and `pendingChanged$`, and the settings.
