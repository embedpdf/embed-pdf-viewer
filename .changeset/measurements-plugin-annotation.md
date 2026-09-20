---
'@embedpdf/plugin-annotation': minor
---

Add distance and calibration presets, point-based viewport scale selection, and per-annotation recalculation reports. Persist leader and caption edits in native PDF fields, preserve the measured endpoints during offset edits, and keep derived measurement values read-only in comments.

Use the standard selection spacing for measurement annotations.

Keep locally created and edited measurements vector-rendered after the engine saves their appearance, matching the existing annotation lifecycle and avoiding repeated switches to raster rendering.

Add area and perimeter presets with scale snapshots captured at the first vertex. Persist shape captions and derived values through ordinary annotation edits, retaining vector rendering after engine responses.
