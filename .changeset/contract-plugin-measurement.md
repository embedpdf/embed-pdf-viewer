---
'@embedpdf/plugin-measurement': minor
---

The measurement plugin now follows the 3.0 public contract.

- Reads are `getPageScale` (was `pageScale`), `ensureLoaded` (was `prepare`), `listLastReports`, `listPresets` / `listUnits` / `listAreaUnits`, `getReadout` (was `readout`), `getCalibrationRequest` (page space), plus the pure `measureDistance` / `measureArea`.
- Scale writes take a `PageTarget` (`PageRef | PageRef[] | 'all'`): `setScale` (was `setPageScale`), `setUnit` (no positional area unit), `setAreaUnit`, `setPrecision`, `setPreset`, and the new `clearScale`. `calibrate` takes `{ page, from, to, distance }` in page space with `options.applyTo`.
- `createMeasurement` creates a distance, perimeter or area annotation with the page's scale.
- Events are hooks: `onScaleChanged`, `onCalibrationRequested`, `onCalibrationCompleted`, `onCalibrationDismissed`. Refusals are `PluginError`s. The package gains `./contract/host` and `./internal` entries.
