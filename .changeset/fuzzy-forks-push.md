---
'@embedpdf/plugin-annotation': minor
---

Add permission checking for annotation operations:

- Check `PdfPermissionFlag.ModifyAnnotations` before creating, updating, or deleting annotations
- Check permission before activating annotation tools
- Check permission before creating annotations from text selection
- Update `AnnotationContainer` components (React, Svelte, Vue) to respect `canModifyAnnotations` permission:
  - Disable drag/resize when permission is denied
  - Hide vertex handles when permission is denied
  - Guard double-click handlers based on permission
