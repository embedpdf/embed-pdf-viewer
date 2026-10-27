---
'@embedpdf/plugin-measurement': minor
---

A named type for the state: `MeasurementState`, what `measurementState` reads and `useMeasurementState()` returns, the State table of the measurements page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/internal` and `/contract/host`, is now `MeasurementModel`, made by `initialMeasurementModel()`, so `MeasurementState` has one meaning.
