---
'@embedpdf/plugin-selection': minor
---

Unified text selection and marquee selection under the `enableForMode` API. Extended `EnableForModeOptions` with `enableSelection`, `showSelectionRects`, `enableMarquee`, and `showMarqueeRects` options. Deprecated `showRects` (use `showSelectionRects`), `setMarqueeEnabled`, and `isMarqueeEnabled` (use `enableForMode` with `enableMarquee`). Added `modeId` to `SelectionChangeEvent`, `BeginSelectionEvent`, `EndSelectionEvent`, `MarqueeChangeEvent`, `MarqueeEndEvent`, and their scoped counterparts. Marquee handler now uses `registerAlways` so any plugin can enable marquee for their mode. Removed `stopImmediatePropagation` from text selection handler in favor of `isTextSelecting` coordination.
