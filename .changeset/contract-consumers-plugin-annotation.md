---
'@embedpdf/plugin-annotation': patch
---

Follows the interaction contract (`getActiveToolId`, `claimCursor`). The markup bridge reads the selection through `getSnapshot` / `listSegments` and the `onChanged` / `onCommitted` hooks.
