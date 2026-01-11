---
'@embedpdf/core': minor
---

Add document permissions support:

- Add `useDocumentPermissions` hook for React, Svelte, and Vue with reactive permission state and helper methods (`hasPermission`, `hasAllPermissions`, and shorthand booleans like `canPrint`, `canCopyContents`, etc.)
- Add `UPDATE_DOCUMENT_SECURITY` action and `updateDocumentSecurity` action creator for updating document security state
- Add reducer case for updating document permissions and owner unlock state
- Add permission helper methods to `BasePlugin`: `getDocumentPermissions`, `checkPermission`, `requirePermission`
- Export `useDocumentPermissions` from shared, svelte, and vue entry points
