---
'@embedpdf/plugin-annotation': patch
---

Fixed rotation calculation in AnnotationLayer components to properly combine page intrinsic rotation with document rotation:

- Updated React `AnnotationLayer` component to compute effective rotation as `(pageRotation + docRotation) % 4`
- Updated Vue `annotation-layer.vue` component with the same rotation logic
- Updated Svelte `AnnotationLayer.svelte` component with the same rotation logic
