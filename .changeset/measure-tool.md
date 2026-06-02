---
'@embedpdf/models': minor
'@embedpdf/engines': minor
'@embedpdf/plugin-annotation': minor
'@embedpdf/snippet': minor
---

Add measurement tools (distance, perimeter, area).

New annotation tools turn Line / Polyline / Polygon / Square / Circle annotations
into calibrated measurements:

- `measureDistance` (Line → distance)
- `measurePerimeter` (Polyline → path length)
- `measureAreaPolygon` (Polygon → area)
- `measureAreaRect` (Square → rectangle area)
- `measureAreaEllipse` (Circle → ellipse area)

Each tool draws a live, zoom-stable measurement label while drawing and on the
committed annotation, across all four framework bindings (React, Preact, Vue,
Svelte).

`@embedpdf/models` gains a measurement model (`PdfMeasurementUnit`,
`PdfMeasurementScale`, `PdfMeasurementPrecision`, `PdfMeasurementInfo`, the
`PdfMeasurementIntent` `/IT` values) and a pure calculation module
(`scaleFactor`, `pointDistance`, `polygonArea`, `formatMeasurement`,
`measurePagePtValue`, …) supporting mm/cm/m/in/ft/yd/pt, decimal or fractional
precision, and an optional secondary unit.

The annotation plugin exposes `setMeasurementScale(scale)` / `getMeasurementScale()`
to calibrate every measurement tool at once, or use the existing
`setToolDefaults` API for finer control:

```ts
annotation.setMeasurementScale({
  value: 10,
  unit: PdfMeasurementUnit.FT,
  pagePoints: 72, // 1 inch on the page = 10 ft
});

annotation.setToolDefaults('measureDistance', {
  measurement: { unit: PdfMeasurementUnit.FT, precision: { type: 'decimal', places: 1 } },
});
```

The `@embedpdf/snippet` viewer gains a **Measure** mode with a toolbar for the
five tools, **draw-to-calibrate** (drag a line over a known distance, then the
dialog opens prefilled with the page distance — type the real length and press
Enter), and a measurement property panel (unit, precision, secondary unit,
scale) shown when a measurement annotation is selected.

Drawing also supports **hold-Shift to constrain** lines and polygon edges to
15° angle increments. Measurements must be drawn (no click-to-place at a fixed
default size), and the Perimeter/Polygon tools show an on-screen hint that they
finish on double-click.

Notes:
- `setMeasurementScale` is the canonical scale source of truth and is projected
  into the measure tools' defaults (fixes a prior get/set asymmetry).
- Circle/Square area measurements are an EmbedPDF extension (the PDF spec
  defines measurement intents only for Line/PolyLine/Polygon), so they carry no
  `/IT` dimension intent — they're recognised via the `measurement` metadata.

Measurement metadata is persisted via the annotation custom-data channel and the
geometry annotation's `measurement` field, and the spec `/IT` intent is written
so other viewers recognise the dimension. (A fully spec-compliant native
`/Measure` dictionary for cross-viewer interop is a planned follow-up.)
