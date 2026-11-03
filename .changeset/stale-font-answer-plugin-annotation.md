---
'@embedpdf/plugin-annotation': patch
---

A free text box restyled after it was typed in is drawn in its new font at once: the fonts the engine answered for its old font no longer draw its body while its other runs follow the new one. An answer holds for the faces it was asked about; a box whose faces change is asked again, and typing keeps the answer.
