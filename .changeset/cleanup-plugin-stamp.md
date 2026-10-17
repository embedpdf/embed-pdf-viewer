---
'@embedpdf/plugin-stamp': patch
---

When the annotation plugin drops an armed stamp on its own (a tool switch, a closed document), `getArmedAsset` readers are woken and `onArmChanged` announces the disarm.
