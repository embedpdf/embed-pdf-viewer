---
'@embedpdf/plugin-redaction': patch
---

Follows the interaction contract (`getActiveToolId`) and the annotation contract (`getRaw`/`listRaw`/`updateRaw`). `markSelection` reads the selection through `getSnapshot`.
