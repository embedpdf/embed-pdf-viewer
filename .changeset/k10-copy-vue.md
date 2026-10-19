---
'@embedpdf/vue': minor
---

`<SelectionClipboard :target="area">` copies only while focus is inside that element (a template ref), for a page with more than one viewer, as `useCommandShortcuts({ target })` does for the other keys. Without `target` it copies anywhere on the page, as before.
