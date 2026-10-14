---
'@embedpdf/engine-services': patch
---

Renders pages in slices of 8 ms (`renderSliceMs`), letting the worker receive messages between them, so aborting a render stops it at the next slice instead of after the whole page. Requests that arrive during a render wait their turn in arrival order, and an aborted request that is still waiting is answered at once without running.

The malformed-page error names the page's object number as `details.pageObjectNumber`.

Keeps up to 128 MB of decoded images between read-only jobs (`decodedImageBudgetBytes` on the worker host), so tiles of image-heavy pages no longer decode the same images again. Any other job empties the store before it runs, and output stays byte-identical. On a plan drawn as one 35-megapixel JPEG, ten zoomed tiles take 21 ms instead of 490 ms.

Keeps a page loaded between read-only jobs (renders, appearance renders, text, geometry, search) instead of parsing it again for every job, so the tiles of a page with millions of objects no longer each pay for a full parse. Output stays byte-identical to loading the page again: kept pages drop their decoded images between jobs, every other job closes kept pages before it runs, and at most one page with many objects is kept per runtime.
