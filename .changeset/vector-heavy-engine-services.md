---
'@embedpdf/engine-services': patch
---

Keeps a page loaded between read-only jobs (renders, appearance renders, text, geometry, search) instead of parsing it again for every job, so the tiles of a page with millions of objects no longer each pay for a full parse. Output stays byte-identical to loading the page again: kept pages drop their decoded images between jobs, every other job closes kept pages before it runs, and at most one page with many objects is kept per runtime.
