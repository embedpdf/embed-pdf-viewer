---
'@embedpdf/engine-core': minor
---

Add the required `pages.insertBlank(spec, destIndex?)` document operation
and make `pages.insert` and `pages.extract` required across engine
implementations. Add the blank-page input types, wire protocol, HTTP paths
and schemas, conformance coverage, and `pages.inserted` event assertions.
