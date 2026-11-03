---
'@embedpdf/web': patch
---

`createSurfaceFocusFollower()` puts the cursor in its element without scrolling. A panel that takes focus as it opens, such as Find, no longer shifts the page around the viewer sideways when the viewer sits in a box that can scroll, such as one with `overflow: hidden` and content off to one side.
