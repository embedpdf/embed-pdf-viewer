---
'@embedpdf/plugin-annotation': minor
---

A tool's `ghost` is `true`, `false` or `{ opacity }` and works for every tool whose click places something: shapes, lines and arrows, free text, notes, stamps and the form plugin's field tools. It is the annotation the click will make, drawn from the tool's live defaults through the same placement the commit uses, and it shows only where the click would reach the tool and the user may create: it hides over annotations and text, stays through a press until it becomes a drag, and clears when the gesture ends. The ghost handler and `ANNOTATION_GHOST_PRIORITY` are gone; the handler that takes the click shows the ghost. `getToolGhost` is `getImageGhost` (the armed stamp's image, now with its opacity), and a sibling plugin reports its placement gesture with `previewPlacement` instead of `setPlacementPreview`. The built-in square, circle and line tools are `upright`, so a click lays them out as the page shows.
