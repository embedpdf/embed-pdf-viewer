---
'@embedpdf/plugin-stage': minor
---

`listCurrentPages()` gives the pages you're on: the current spread while it fits across the view, its two pages side by side however tall they are, else the current page alone. `nextPage()` and `previousPage()` step past those pages, and `canGoNext()` and `canGoPrevious()` say whether there's a page after or before them. A spread that fits across the view but is taller than it used to step one page at a time, so Next from 1–2 went to page 2, already on screen, and nothing moved; and on the second page of the first or last spread, Previous or Next was enabled and did nothing. A spread that fits across the view also lands at its top, like a page.
