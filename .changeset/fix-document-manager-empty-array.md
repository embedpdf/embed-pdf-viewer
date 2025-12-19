---
'@embedpdf/plugin-document-manager': patch
---

Fixed `useOpenDocuments` hook to correctly handle empty `documentIds` arrays. Previously, passing an empty array would fall through to returning all documents; now it correctly returns an empty array. This fix applies to React, Vue, and Svelte hooks.
