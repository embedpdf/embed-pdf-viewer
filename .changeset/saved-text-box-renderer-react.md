---
'@embedpdf/react': patch
---

A renderer that draws free text itself with `useRichTextEditor()` shows the text of every text box, including the ones saved in the PDF. Before, a saved box that wasn't being edited drew empty until it was double-clicked.
