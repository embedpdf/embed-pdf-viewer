---
'@embedpdf/react': minor
---

`<SelectionClipboard target={ref}>` copies only while focus is inside that element, for a page with more than one viewer, as `useCommandShortcuts({ target })` does for the other keys. Without `target` it copies anywhere on the page, as before.
