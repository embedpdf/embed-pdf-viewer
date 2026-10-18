---
'@embedpdf/engine': patch
---

The local engine no longer stalls when a call that every job waits for, such as `engine.fonts.register()`, is queued while a page read runs: a running read now gives way only to work that is more urgent than what waits behind it, so every queued call still gets its answer.
