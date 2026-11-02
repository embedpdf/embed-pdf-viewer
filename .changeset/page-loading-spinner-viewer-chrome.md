---
'@embedpdf/viewer-chrome': patch
---

The spinner on a page whose picture is on its way turns in place. It slid across the page instead, because its placement and its spin shared one `transform`. The `page-loading` part is still the circle, so restyling it works as before.
