---
'@embedpdf/plugin-stage': minor
---

In paged flow, pushing past the edge of the page turns it, as readers expect from a wheel, a trackpad and a finger. Scroll or swipe past the bottom for the next page, at its top; past the top for the previous page, at its bottom; or swipe sideways past the edge (the other way in a right-to-left document). A tall page stops at its bottom first, and the next push turns it. One gesture turns one page, and its momentum doesn't scroll the page that arrives. The new `turnGestures` setting (default `true`) turns this off, leaving page turns to `nextPage()`, `previousPage()` and navigation. Nothing changes in continuous flow.
