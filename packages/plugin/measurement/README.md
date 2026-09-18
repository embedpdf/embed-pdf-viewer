# @embedpdf/plugin-measurement

Document-scoped page calibration, distance authoring, and measurement readouts.
Install alongside `annotationPlugin()` and `interactionPlugin()`:

```ts
import {
  measurementPlugin,
  MeasurementToken,
} from '@embedpdf/plugin-measurement';

const plugins = [
  /* interaction, annotation, ... */ measurementPlugin({
    defaultScale: 'metric',
  }),
];
const measurements = viewer.get(MeasurementToken);
await measurements.calibrate(pageObjectNumber, fromPdfPoint, toPdfPoint, {
  value: 5,
  unit: 'm',
});
```

`calibrate` points are original PDF user space: y-up, including the page's CropBox
origin. The line's length is rounded through the engine's float32 coordinate
rules. `UserUnit` participates in ratio presets; a calibration from a known
length already expresses the full conversion.

The annotation plugin supplies the `distance` and `calibrate` tools. Distance
captures the last viewport containing its **first point**. A foreign or invalid
winning viewport prevents creation; a default is used only outside all viewports.
Until viewport reads finish, distance creation is unavailable.

`setPageScale`, `setPreset`, `setUnit`, `setPrecision`, and `calibrate` accept
`{ recalculate?: boolean, allPages?: boolean }`. Recalculation defaults to true.
Every annotation stores its own scale snapshot. Setting `recalculate: false`
changes subsequent measurements while preserving existing values.

Recalculation reports list updated, skipped, and failed annotations. A page-wide
annotation read failure appears as `error`. A single-page viewport write failure
rejects before annotation writes; all-pages operations return per-page
`scaleError` results and finish the remaining pages. Page scales persist in the
PDF when the engine provides `page.measure`; older engines retain them for the
session (`pageScale().persistent === false`).

`canCalibrate()` mirrors `doc.annotate.modify`; `canMeasure(pon)` combines
annotation creation authority and viewport readiness. Per-record permissions and
PDF flags gate recalculation and caption dragging. Distance contents are derived
and cannot be edited as comment text.

React consumers import `measurementPlugin`, `useMeasurement`, `usePageScale`, and
`useMeasurementReadout` from `@embedpdf/react/measurement`. The full viewer includes
a Measure toolbar, scale sidebar, and known-length calibration dialog.

Distance captions use standard PDF line-axis offsets. Their live layout uses an
estimated Helvetica advance; committed annotations render the native PDF
appearance. Perimeter and area authoring tools are not included in this package's
initial viewer increment; readouts and page recalculation support their existing
engine annotations.
