---
'@embedpdf/plugin-stamp': patch
---

`disarm()` now goes back to the tool that was active before `armAsset()`, or to the default tool when that one is gone, instead of leaving the `stamp` tool active with nothing armed. Switching to another tool while a stamp is armed still disarms it and keeps that tool.
