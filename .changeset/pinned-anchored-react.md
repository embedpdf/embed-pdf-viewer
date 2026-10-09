---
'@embedpdf/react': minor
---

`<Anchored>` takes `pinned`, the new start and end placements, and a negative `gap`, for badges and status that stay on their annotation. Anchored UI on a page that isn't on screen renders nothing and isn't rendered again while people scroll or zoom, and anchored UI out of view isn't drawn, so hundreds of them cost only the ones in view. `useAnnotationAnchor()` re-renders only when its annotation moves, not on every camera frame.
