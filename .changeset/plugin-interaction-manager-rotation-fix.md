---
'@embedpdf/plugin-interaction-manager': patch
---

Fixed rotation calculation in PagePointerProvider components to properly handle rotation override and combine page intrinsic rotation with document rotation:

- Updated React `PagePointerProvider` to use rotation override directly when provided, otherwise combine page and document rotation
- Updated Vue `page-pointer-provider.vue` with the same rotation logic
- Updated Svelte `PagePointerProvider.svelte` with the same rotation logic
