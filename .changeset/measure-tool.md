---
'@embedpdf/engine-core': minor
'@embedpdf/engine-services': minor
'@embedpdf/core-annotation': minor
'@embedpdf/plugin-annotation': minor
'@embedpdf/react': minor
'@embedpdf/viewer-chrome': minor
---

Add measurement annotations — calibrated distance, perimeter and area read-outs
drawn over ordinary geometry annotations.

Five new tools ship in `DEFAULT_TOOLS`, each a preset of the draw tool it
extends, so they need no new gesture or subtype:

| Tool                   | Draws    | Reports                |
| ---------------------- | -------- | ---------------------- |
| `measure-distance`     | line     | straight-line distance |
| `measure-perimeter`    | polyline | path length            |
| `measure-area-polygon` | polygon  | area                   |
| `measure-area-rect`    | square   | rectangle area         |
| `measure-area-ellipse` | circle   | ellipse area           |

What makes an annotation a measurement is a `measurement` calibration on it —
a new entry in the flat props vocabulary, so it is set, edited and cleared
through the same `setDefaults` / `updateSelection` paths as colour or opacity.
Setting it promotes a shape into a dimension; `null` demotes it back.

The read-out is DERIVED from the geometry on every render, so a later vertex
drag or resize keeps the number honest, and it is drawn zoom-stably (a constant
on-screen size) with a hatch fill for areas. Units: mm/cm/m/in/ft/yd/pt, decimal
or fractional precision, and an optional secondary unit — `10.0 m (32.81 ft)`.

- `@embedpdf/engine-core` gains the calibration vocabulary (`MeasurementInfo`,
  `MeasurementScale`, `MeasurementUnit`, `MeasurementPrecision`) and the pure
  unit math (`formatMeasurement`, `scaleFactor`, `toRealValue`,
  `parseMeasurementInfo`). The five geometry kinds carry `measurement` on their
  DTO/Draft/Patch, tri-state like every other patch field.
- `@embedpdf/engine-services` persists it under `/EMBD_Metadata/Measurement`
  and writes the spec `/IT` intent (`LineDimension` / `PolyLineDimension` /
  `PolygonDimension`) so other viewers recognise the dimension. The intent is
  derived from the subtype and mode, so the two can never drift apart.
- `@embedpdf/core-annotation` gains the geometry half (`measureRawValue`,
  `measureText`, `measureLabelAnchor`, `hatchPath`) and paints the read-out
  through the shared `scene()`, so every framework renderer gets it for free.
- `@embedpdf/plugin-annotation` adds `setMeasurementScale(scale)` /
  `measurementScale()` to re-calibrate every measure tool at once — calibration
  is a property of the document, not of whichever tool is armed.
- `@embedpdf/viewer-chrome` adds a **Measure** mode with the five tools and a
  Measurement section in the style panel (scale, display unit, precision,
  second unit) that calibrates the armed tool or the selected measurement.

Note: measurement metadata rides in EmbedPDF's `/EMBD_Metadata` dictionary
alongside the spec `/IT` intent. A fully spec-compliant native `/Measure`
dictionary needs PDFium bindings that do not exist yet, and remains a
follow-up for cross-viewer interop of the SCALE (the intent already travels).
