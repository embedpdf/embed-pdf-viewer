---
'@embedpdf/viewer-chrome': minor
---

The View only label is no longer in the default layout: a read-only viewer just shows no tools, as a
PDF reader does. To tell people why, add it where you want it:
`layout: (layout) => layout.add({ custom: 'view-only' }, { to: 'main', before: 'panel:search' })`.
It still shows only while nothing can change the document.
