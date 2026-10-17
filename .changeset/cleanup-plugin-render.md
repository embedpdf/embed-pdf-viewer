---
'@embedpdf/plugin-render': patch
---

Rasters are also invalidated by page and annotation flattens (content scope), by a completed signature (the sealed widget's page), and by a desynced event stream (every page, content scope, no origin).

Render requests and appearance reads use the revised page-space targets and document render options across local and cloud engines.
