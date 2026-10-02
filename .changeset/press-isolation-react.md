---
'@embedpdf/react': patch
'@embedpdf/web': patch
---

A press on a link or a form field stops there: it no longer reaches the Stage below (where it started the active tool's gesture or ended an edit), and it reaches the PDF's own actions as "mouse down", which form fields never sent before. `isolatePointerDown(element, onPress)` takes the press for the control, because React's own handlers run from the root, after the Stage has seen it.
