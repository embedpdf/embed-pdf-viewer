---
'@embedpdf/plugin-selection': patch
---

Fixed rotation calculation in SelectionLayer components to properly combine page intrinsic rotation with document rotation:

- Updated React `SelectionLayer` component to compute effective rotation as `(pageRotation + docRotation) % 4`
- Updated Vue `selection-layer.vue` component with the same rotation logic
- Updated Svelte `SelectionLayer.svelte` component with the same rotation logic
