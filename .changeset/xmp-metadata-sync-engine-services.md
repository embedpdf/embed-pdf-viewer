---
'@embedpdf/engine-services': minor
---

`metadata.update` keeps a document's XMP packet in step with its `/Info` fields: a field it sets is written to its XMP property (`dc:title`, `dc:creator`, `dc:description`, `pdf:Keywords`, `xmp:CreatorTool`, `pdf:Producer`, `xmp:CreateDate`, `xmp:ModifyDate`, `pdf:Trapped`), added when the packet doesn't have it, and a field it sets to `null` is removed from the packet too. A packet's `dc:subject` keyword list follows the keywords. `metadata.custom.update` changes or removes the `pdfx:` property Adobe apps copy a custom key to, and never adds one. Everything else in the packet stays as written; a document without XMP gets none, and XMP that isn't well-formed is left as it is.
