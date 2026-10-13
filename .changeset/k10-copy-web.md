---
'@embedpdf/web': minor
---

`wireSelectionClipboard(selection, { target })` takes an element as well as a document. With an element, Ctrl/Cmd+C and Edit → Copy copy only while focus is inside it, so two viewers on a page never both copy and the page keeps its own copying. Whether the browser copies a live DOM selection itself is read from the element's shadow root or document.
