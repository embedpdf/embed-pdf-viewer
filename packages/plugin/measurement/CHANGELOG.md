# @embedpdf/plugin-measurement

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The measurement plugin now follows the 3.0 public contract.
  - Reads are `getPageScale` (was `pageScale`), `ensureLoaded` (was `prepare`), `listLastReports`, `listPresets` / `listUnits` / `listAreaUnits`, `getReadout` (was `readout`), `getCalibrationRequest` (page space), plus the pure `measureDistance` / `measureArea`.
  - Scale writes take a `PageTarget` (`PageRef | PageRef[] | 'all'`): `setScale` (was `setPageScale`), `setUnit` (no positional area unit), `setAreaUnit`, `setPrecision`, `setPreset`, and the new `clearScale`. `calibrate` takes `{ page, from, to, distance }` in page space with `options.applyTo`.
  - `createMeasurement` creates a distance, perimeter or area annotation with the page's scale.
  - Events are hooks: `onScaleChanged`, `onCalibrationRequested`, `onCalibrationCompleted`, `onCalibrationDismissed`. Refusals are `PluginError`s. The package gains `./contract/host` and `./internal` entries.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `canMeasure`, `pageScale`, `prepare`, `setPageScale`, `calibrate`, `setPreset`, `setUnit`, `setAreaUnit` and `setPrecision` take a `PageRef` (or `'all'`); calibration requests, scale-change reports and the `onScaleChanged` event carry `page`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Read page measurement scales and viewports from confirmed document state, and
  preserve the last known viewports when a refresh fails. Align measurement
  creation, calibration, and readouts with page-space geometry and the engine's
  annotation fields.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The settings are live: `defaultScale` and `presets` are read through `getSettings()`, changed with `updateSettings()` and `resetSettings()` for every document, and announced by `onSettingsChanged` (`MEASUREMENT_DEFAULTS`). A new default scale reaches the pages without a scale of their own, and `listPresets()` and `setPreset()` follow the `presets` setting.

  `createMeasurement()` resolves `{ annotation }` (was the ref). `startCalibration()` throws `permission-denied` without `doc.annotate.modify` (it did nothing before), as `canCalibrate()` says. Every page argument is a ref or an index (`getPageScale`, `canMeasure`, `ensureLoaded`, `measureDistance`, `measureArea`, a page target, `createMeasurement` and `calibrate` inputs); a scale change refuses a page that isn't there before it writes anything. Every async verb takes a `signal`. `measurementState` declares the state (`busy`, `calibrationRequest`, `lastReports`).

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A measurement reads its tool's style from the annotation plugin's `tools.getDefaults()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `getReadout(ref)` hands out the same readout object until the annotation changes, so a framework read compares it by identity. New exports for a read with nothing to read: `NO_PAGE_SCALE`, a page's scale before a document opens or for a page that isn't there, and `NO_READOUT`, which `getReadout` also answers for an annotation that isn't there.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework instead of throwing.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Follows the annotation contract (`RecalibrationReport` from `/contract/host`).

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Internal: the controller composes through the kernel's `composeApi`; page ↔ PDF conversion goes through the kernel's page geometry instead of a copy of its own.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A download waits for scale changes still on their way, so the file has the new scale and the measurements it relabels.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Key the per-document driver by the capability instance instead of the document id, so two kernels holding the same document id keep independent drivers.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A refused call names what was missing: `error.permission` is `'doc.annotate.modify'` for a scale change and `'annotations:create'` for `createMeasurement`. `canMeasure` reads the same permission `createMeasurement` checks.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A page's viewports read that the closing document cut short no longer writes its error into the closed plugin's state, which the kernel reported as `a state update after the instance closed`, as when a reader leaves a page within a second of its first page showing.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Introduce page calibration, scale presets, units, precision, measurement readouts, and optional recalculation of existing annotations. Report partial results across pages and support session-only calibration on older engines.

  Expose area unit choices and independent area-unit updates that preserve distance formatting.
