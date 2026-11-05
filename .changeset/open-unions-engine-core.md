---
'@embedpdf/engine-core': minor
---

Every union a response carries with a catch-all kind is a named contract model: a field's stored value (`FormValueEntry`) and a measure (`PdfMeasurement`) join `Annotation`, `FormField`, `PdfLinkTarget` and `PdfActionNode` in the wire components. Each of the six, a widget's `fieldFamily` and an error's `code` now describe what a client reads a kind or value it doesn't know as. `openUnionOf()` and `openUnionsIn()` in `@embedpdf/engine-core/conformance` find the unions with a catch-all in a schema.
