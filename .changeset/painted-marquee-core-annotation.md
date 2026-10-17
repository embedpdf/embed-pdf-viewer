---
'@embedpdf/core-annotation': minor
---

The marquee selects what it touches of what each annotation paints: its ink, or the inside of a filled shape, as a click hits it. A box drawn inside an unfilled shape, or in the empty corners of a diagonal line's bounds, no longer selects it; one that touches only a callout's line, an arrowhead, a measurement's caption or a cloud's bumps does. A screen-anchored body counts where it shows at the view. A marquee of no size catches exactly what a click with no margin hits. `selectionInBox(model, page, rect, inert?, view?)` is what a box selects, groups included; the marquee gesture uses it. `quadIntersectsRect` is gone.
