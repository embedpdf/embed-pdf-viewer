# @embedpdf/plugin-measurement

Document-scoped page calibration, measurement authoring, and measurement readouts.
Install alongside `annotationPlugin()` and `interactionPlugin()`:

```ts
import { measurementPlugin, MeasurementToken } from '@embedpdf/plugin-measurement';

const plugins = [
  /* interaction, annotation, ... */
  measurementPlugin({ defaultScale: 'metric' }),
];

const measurements = viewer.get(MeasurementToken);
await measurements.calibrate({ page, from, to, distance: { value: 5, unit: 'm' } });
```

`calibrate` points are page space, like the `CalibrationRequest` the calibrate
tool produces; the plugin converts them to PDF user space, and the line's length
is rounded through the engine's float32 coordinate rules. `UserUnit` participates
in ratio presets; a calibration from a known length already expresses the full
conversion.

The annotation plugin supplies the `distance`, `perimeter`, `area`, and
`calibrate` tools. A measurement captures the last viewport containing its
**first point**. A foreign or invalid winning viewport prevents creation; the
default scale is used only outside all viewports. Until the page's viewport reads
finish, measurement creation is unavailable.
`createMeasurement({ kind, page, points })` creates the same annotations from
code and rejects with `not-ready` before the page's scale is known.
`startCalibration()` arms the calibrate tool; its two points arrive as
`onCalibrationRequested` (and `getCalibrationRequest()`) awaiting the real
length, and `dismissCalibration()` drops the request.

`setScale`, `setPreset`, `setUnit`, `setAreaUnit`, `setPrecision`, and
`clearScale` take a page target — one page, an array of pages, or `'all'` — and
`{ recalculate?: boolean }`. `calibrate` writes its input page unless `applyTo`
names a wider target. Recalculation defaults to true. Every annotation stores its
own scale snapshot. Setting `recalculate: false` changes subsequent measurements
while preserving existing values.

Each scale change resolves to one report per page listing updated, skipped, and
failed annotations; `listLastReports()` keeps the last set and `onScaleChanged`
fires per page. A page-wide annotation read failure appears as `error`. A
single-page viewport write failure rejects before annotation writes; multi-page
operations (several pages or `'all'`) return per-page `scaleError` results and
finish the remaining pages. Page scales persist in the PDF when the engine
provides `page.measure`; without it they last for the session
(`getPageScale(page).persistent === false`).

`canCalibrate()` mirrors `doc.annotate.modify`; `canMeasure(page)` combines
annotation creation authority and viewport readiness. Per-record permissions and
PDF flags gate recalculation and caption dragging. Measurement contents are
derived and cannot be edited as comment text. `getReadout(ref)` formats a
measurement annotation; `measureDistance` and `measureArea` convert page-space
points in the page's scale without creating anything.

React consumers import `measurementPlugin`, `useMeasurement`, `usePageScale`,
`useMeasurementReadout`, `useCalibrationRequest`, and `useMeasurementEvent` from
`@embedpdf/react/measurement`. The full viewer includes a Measure toolbar
(distance, perimeter, area, calibrate), a scale sidebar, and a known-length
calibration dialog.

Distance captions use standard PDF line-axis offsets. Their live layout uses an
estimated Helvetica advance; committed annotations render the native PDF
appearance.
