---
'@embedpdf/engine-services': patch
---

Renders pages in slices of 8 ms (`renderSliceMs`), letting the worker receive messages between them, so aborting a render stops it at the next slice instead of after the whole page. Requests that arrive during a render wait their turn in arrival order, and an aborted request that is still waiting is answered at once without running.
