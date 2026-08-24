---
'@embedpdf/plugin-render': minor
---

Add a configurable render strategy for exact and lattice-backed deployments, with separate full-page and tile-plane budgets, format conformance, settled level selection, and public paint settings.

Deep-zoom tiling now uses bled overlap, presentation-aware generation retention, bounded fetch backpressure and raster residency, stage-less demand limits, stronger raster identities, failure isolation, and optional diagnostics. These changes keep tile memory bounded while preventing stale reuse, visible seams, and quality regressions during zoom and pan transitions.
