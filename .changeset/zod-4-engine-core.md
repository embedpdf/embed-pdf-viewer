---
'@embedpdf/engine-core': minor
---

The schemas are built with zod 4 (`^4.6.6`), so installing EmbedPDF no longer brings in a zod that npm reports for GHSA-mrhx-c7xc-m3w5. What they accept and refuse is the same; the wording of a refused value's message is zod 4's. Code that combines an exported schema with its own needs zod 4 too.
