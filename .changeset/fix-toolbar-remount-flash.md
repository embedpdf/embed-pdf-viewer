---
'@embedpdf/plugin-ui': patch
---

Fixed toolbar/sidebar/modal switching causing unnecessary component remounts

The `useSchemaRenderer` hook was using the toolbar/sidebar/modal ID as the React key, which caused full component remounts when switching between different toolbars in the same slot (e.g., annotation-toolbar → shapes-toolbar). This resulted in visible flashing of sibling components like the RenderLayer.

The fix uses stable slot-based keys (`toolbar-slot-top-secondary`, `sidebar-slot-left-main`, etc.) so that switching content within a slot only updates the children without remounting the wrapper element. This prevents React/Preact reconciliation from affecting sibling components in the tree.
