---
'@embedpdf/viewer-chrome': patch
---

The viewer fills forms through `<FormLayer>` above its `<AnnotationLayer>`, and its signature panel and inspector read `useSignatureState()`; the inspector anchors at the signed field's own box.
