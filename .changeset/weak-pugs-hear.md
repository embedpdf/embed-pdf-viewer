---
'@embedpdf/engines': minor
'@embedpdf/models': minor
'@embedpdf/plugin-render': minor
---

Add optional **form widget rendering** to the render pipeline.

### What changed

- **@embedpdf/models**
  - `PdfRenderPageOptions` now supports `withForms?: boolean` to request drawing interactive form widgets.

- **@embedpdf/engines**
  - `PdfiumEngine.renderPage` and `renderPageRect` honor `withForms`.  
    When enabled, the engine initializes the page form handle and calls `FPDF_FFLDraw` with the correct device transform.
  - New helper `computeFormDrawParams(matrix, rect, pageSize, rotation)` calculates start offsets and sizes for `FPDF_FFLDraw`.

- **@embedpdf/plugin-render**
  - New plugin config flags:
    - `withForms?: boolean` (default `false`)
    - `withAnnotations?: boolean` (default `false`)
  - The plugin merges per-call options with plugin defaults so callers can set once at init or override per call.
