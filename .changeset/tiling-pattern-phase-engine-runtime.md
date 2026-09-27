---
'@embedpdf/engine-runtime': patch
---

Keeps tiling patterns in place at every zoom. For a pattern whose cell box equals its step, the renderer placed each cell a cell width rounded up to whole pixels after the previous one, counting from the pattern's origin, so the rounding added up over the cells between that origin and the page. With the origin hundreds of cells off the page, as in a star chart's hatching, the stripes landed tens of pixels from where the PDF puts them, and somewhere else at every zoom. Every cell is now placed at its own position, rounded to the pixel, as for any other pattern, so the stripes sit where Acrobat shows them.
