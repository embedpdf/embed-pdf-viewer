---
'@embedpdf/angular': patch
---

A renderer that draws free text itself with `[epdfRichTextEditor]` shows the text of every text box, including the ones saved in the PDF. Before, a saved box that wasn't being edited drew empty until it was double-clicked. Typing in such a box works too: the element takes focus when editing starts, where before the keys went to the page.
