---
'@embedpdf/plugin-measurement': minor
---

`canMeasure`, `pageScale`, `prepare`, `setPageScale`, `calibrate`, `setPreset`, `setUnit`, `setAreaUnit` and `setPrecision` take a `PageRef` (or `'all'`); calibration requests, scale-change reports and the `onScaleChanged` event carry `page`.
