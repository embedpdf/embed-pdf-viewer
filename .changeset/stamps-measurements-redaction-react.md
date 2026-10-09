---
'@embedpdf/react': minor
---

`/stamp`, `/measurement` and `/redaction` have the four hooks every plugin has. `useStampState()` (`armedAsset`, for the document in scope), `useStampSettings()`, and `useStampAssets({ libraryId })` (was a bare id); `useArmStampAsset()` is gone: `useStamp().armAsset(assetId)` places on the document the component is in. `useMeasurement()` is the capability only, `useMeasurementState()` reads `busy`, `calibrationRequest` and `lastReports`, and `useMeasurementSettings()` the settings; `useCalibrationRequest()` is gone. `useRedaction()` is the capability only, `useRedactionState()` reads `pendingCount`, `applying` and `lastResult`, and `useRedactionSettings()` the settings. `usePageScale(page)`, `useMeasurementReadout(ref)` and `usePendingRedactions({ page })` take a page as a ref or an index, and read empty before a document opens.
