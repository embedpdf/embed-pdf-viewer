---
'@embedpdf/plugin-measurement': minor
---

The settings are live: `defaultScale` and `presets` are read through `getSettings()`, changed with `updateSettings()` and `resetSettings()` for every document, and announced by `onSettingsChanged` (`MEASUREMENT_DEFAULTS`). A new default scale reaches the pages without a scale of their own, and `listPresets()` and `setPreset()` follow the `presets` setting.

`createMeasurement()` resolves `{ annotation }` (was the ref). `startCalibration()` throws `permission-denied` without `doc.annotate.modify` (it did nothing before), as `canCalibrate()` says. Every page argument is a ref or an index (`getPageScale`, `canMeasure`, `ensureLoaded`, `measureDistance`, `measureArea`, a page target, `createMeasurement` and `calibrate` inputs); a scale change refuses a page that isn't there before it writes anything. Every async verb takes a `signal`. `measurementState` declares the state (`busy`, `calibrationRequest`, `lastReports`).
