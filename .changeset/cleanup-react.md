---
'@embedpdf/react': minor
---

The `Geom` type is no longer re-exported from `@embedpdf/react/annotation`; use the public `AnnotationGeometry`. The armed stamp's ghost follows `getArmedStamp()`. `usePages()` returns `previous` instead of `prev`. `useMeasurement()` no longer returns `canCalibratePage` (it was the document-wide `canCalibrate()`); read the permission with `useSelector(MeasurementToken, (measurement) => measurement.canCalibrate())`, like every other plugin's permissions.
