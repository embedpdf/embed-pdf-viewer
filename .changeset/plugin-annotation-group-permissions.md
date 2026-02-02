---
'@embedpdf/plugin-annotation': patch
---

Fixed group selection box ignoring document permissions:

- Added `canModifyAnnotations` permission check to `GroupSelectionBox` component across React, Vue, and Svelte
- Group drag and resize operations are now properly disabled when the user lacks annotation modification permissions
- This aligns group selection behavior with individual annotation container permission checks
