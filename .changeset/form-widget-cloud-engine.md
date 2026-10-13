---
'@cloudpdf/engine': patch
---

`forms.attachWidget` and `forms.detachWidget` send the widget's `AnnotationRef` as `body.widget`; widget records on the wire carry `ref`.
