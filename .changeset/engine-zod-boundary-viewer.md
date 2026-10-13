---
'@embedpdf/viewer': patch
---

The viewer's first load carries no zod and no schema: it predicts what a write will do without schema validation, and the engine checks the write in its worker; a change the engine refuses leaves the view. An npm app's main-thread JavaScript at first load goes from 1217 to 1081 KB (380 to 341 KB gzipped), the CDN snippet's from 1699 to 1513 KB (455 to 408 KB gzipped). Without a `Worker`, the engine runs in the page from one self-contained chunk, loaded only then.
