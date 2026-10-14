---
'@embedpdf/plugin-render': patch
---

Add `samePageViewDemand(left, right)` to the contract, to compare two tile demands by value. The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework.
