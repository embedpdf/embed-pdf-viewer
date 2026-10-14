---
'@embedpdf/viewer-chrome': patch
---

The thumbnail rail registers its view with `interaction: false` and `zoomGestures: false`, and the page controls read the Stage's state hook. Spread and scroll commands change the Stage through `updateSettings()`, and "Go to link" follows the link through `activate()`, which opens a website itself.
