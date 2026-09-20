---
'@cloudpdf/engine': patch
'@cloudpdf/server': patch
'@cloudpdf/contract': patch
---

The widget attach and detach routes accept the widget's `AnnotationRef` as `body.widget`; widget records on the wire carry `ref`.
