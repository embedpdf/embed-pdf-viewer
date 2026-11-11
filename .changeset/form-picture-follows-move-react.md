---
'@embedpdf/react': patch
---

`<FormLayer>` draws a field's picture where the field is now. A field that was moved, in Form design or with `updateWidget()`, kept its picture at the old place until the page's pictures were loaded again: the field showed in one place and took clicks in another.
