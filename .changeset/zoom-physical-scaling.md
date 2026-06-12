---
"@embedpdf/plugin-zoom": minor
---

Add opt-in `usePhysicalScaling` config option to the zoom plugin.

When `usePhysicalScaling: true`, every numeric zoom request is treated as a
user-space / logical value and multiplied by `(96 / 72) × devicePixelRatio`
before being applied to the rendering pipeline:

- `96 / 72` is the fixed CSS-px-per-PDF-pt constant (1 CSS inch = 96 px,
  1 PDF point = 1/72 inch), ensuring "100 %" maps to physical inches on any
  screen regardless of pixel density.
- `devicePixelRatio` accounts for OS display scaling so the rendered size
  remains correct when the window moves between monitors or the OS zoom changes.

At 100 % zoom on a 96 DPI, DPR=1 screen an A4 page is ~794 CSS px wide
(its true physical width of 8.27 in × 96 px/in), matching Acrobat's
"Use system setting" behaviour.

New additions:
- `ZoomPluginConfig.usePhysicalScaling?: boolean` — opt-in flag (default `false`; behaviour is bit-identical to previous releases when unset).
- `ZoomDocumentState.currentUserZoomLevel: number` — user-space scale (= `currentZoomLevel / effectiveMultiplier`). Always equals `currentZoomLevel` when `usePhysicalScaling` is off.
- `ZoomScope.getDpr(): number` / `ZoomCapability.getDpr(): number` — returns the active scale multiplier `(96/72) × devicePixelRatio`, or 1 when disabled.

Fit modes (`fit-width`, `fit-page`, `automatic`) are unaffected and continue to fit the viewport in CSS-pixel space.
