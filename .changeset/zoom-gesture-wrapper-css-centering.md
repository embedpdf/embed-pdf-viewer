---
'@embedpdf/plugin-zoom': patch
---

`ZoomGestureWrapper` now centers the pages with CSS (a block wrapper shrink-wrapped to the pages with auto side margins) instead of writing `margin-left` from a `ResizeObserver`. The old approach left a stale margin for one layout pass whenever the page width changed (first render, zoom, container resize), which pushed the pages past the viewport edge, toggled the horizontal scrollbar and resized the viewport from inside its own observer callback. Browsers reported that as `ResizeObserver loop completed with undelivered notifications` on the window. The inline-block wrapper also reserved descender space below the last page, which showed a vertical scrollbar in fit-page mode for a few pixels of whitespace. Layout is otherwise unchanged: pages narrower than the viewport are centered, wider pages start at the left edge and scroll horizontally.
