---
'@embedpdf/engine-services': patch
---

An `/XYZ` destination that leaves out trailing parameters, such as `[page /XYZ 10 700]`, keeps the left and top it has instead of reading all three as `null`. `/XYZ` is now read through `FPDFDest_GetView` and the null-parameter mask like every other view type. A `0` zoom still reads as `null`, which means the same.
