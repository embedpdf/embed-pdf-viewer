---
'@embedpdf/engine-services': patch
---

Reads and writes use the `Annotation` type (was `AnnotationDTO`). An update that sends back the `file: null` a file attachment without an embedded file reads as changes nothing; removing an existing file is still refused.
