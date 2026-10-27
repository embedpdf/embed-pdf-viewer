---
'@embedpdf/viewer-chrome': patch
---

Hide the Measure tab when the session can neither draw measurements nor set a page's scale: the measurement panel, and the Measure bar's scale button that opens it, now follow the same permission checks as the measurement tools. The scale button is drawn like every other bar button, so the Measure bar is as tall as the other mode bars, and it shows pressed while the panel is open; clicking it again closes the panel.
