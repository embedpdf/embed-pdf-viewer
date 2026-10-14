---
'@embedpdf/engine-services': patch
---

A widget update that changes only its border style keeps the border's width, and one that changes only the width keeps the style. Before, a new style reset the width to 1, and a new width made a dashed border solid.
