---
'@embedpdf/plugin-redaction': patch
---

Fixed rotation calculation in RedactionLayer components to properly combine page intrinsic rotation with document rotation:

- Updated React `RedactionLayer` component to compute effective rotation as `(pageRotation + docRotation) % 4`
- Updated Vue `redaction-layer.vue` component with the same rotation logic
- Updated Svelte `redaction-layer.svelte` component with the same rotation logic
