---
'@embedpdf/plugin-rotate': patch
---

Fixed rotation calculation in Rotate components to properly handle rotation override and combine page intrinsic rotation with document rotation:

- Updated React `Rotate` component to use rotation override directly when provided, otherwise combine page and document rotation
- Updated Vue `rotate.vue` component with the same rotation logic
- Updated Svelte `Rotate.svelte` component with the same rotation logic
