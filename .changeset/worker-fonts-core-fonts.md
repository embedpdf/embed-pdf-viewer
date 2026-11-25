---
'@embedpdf/core-fonts': patch
---

`BUILT_IN_PROGRAMS` names the standard fonts' programs without the code that loads them, so a bundle that only reads their hashes no longer holds the 14 font files. No API change.
