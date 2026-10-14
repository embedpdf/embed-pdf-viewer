---
'@embedpdf/angular': minor
---

`<epdf-stage>` loses its `interaction`, `panFallback` and `zoomGestures` inputs: they are the view's settings now (`stagePlugin({ token, interaction: false })`, or `updateSettings()` while the app runs). `injectLayout()`'s setters change the settings through `updateSettings()`.
