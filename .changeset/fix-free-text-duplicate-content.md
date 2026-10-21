---
'@embedpdf/plugin-annotation': patch
---

Prevent free text annotations from duplicating content after editing, blurring,
and re-entering the text box. Keep the browser in control of the editable DOM
and preserve line breaks when displaying the saved text.
