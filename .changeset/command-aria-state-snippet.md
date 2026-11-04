---
'@embedpdf/snippet': patch
---

Expose the correct ARIA state on toolbar/menu buttons that toggle something. Pan Mode and Pointer Mode now announce `aria-pressed`, and their labels changed from "Toggle Pan Mode"/"Toggle Pointer Mode" to "Pan Mode"/"Pointer Mode" now that the pressed state itself is announced. Every menu- and panel-opening command (Document Menu, Page Settings, Zoom Menu, the tab overflow menu, and the annotation/shapes/form/insert/comment/redaction/search/sidebar panel toggles) now announces `aria-expanded`, which was previously missing everywhere.
