---
'@embedpdf/engine-services': minor
---

Listing pages reads each page's measurement viewports from its dictionary, without loading the page, and `measure.viewports` and scale writes no longer load the page either. A `pages.setScale` op applies a scale to every page it names, taking a scale's origin on each page's own visible box, and records each page's previous scale for undo.
