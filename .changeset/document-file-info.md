---
'@embedpdf/engine-core': minor
'@embedpdf/engine-services': minor
'@embedpdf/engine': minor
---

Three reads a viewer needs to show a document the way it is written. `doc.metadata.file()` returns the header's version, the trailer's `/ID` pair, the catalog's `/Lang`, `/PageMode` and XMP packet, and the Info dictionary as written (dates unparsed, custom keys included); no page is loaded. Outline items carry `destinationName`, the name of the named destination their target goes to (`null` for an explicit one), so a viewer can address it by name. `doc.actions.resolveNamedDestination(name)` returns the destination a name stands for, from the `/Names /Dests` tree or the older `/Dests` dictionary.
