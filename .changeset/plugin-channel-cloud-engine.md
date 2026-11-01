---
'@cloudpdf/engine': minor
---

Reach a server module from the browser: `cloudDocument(doc)?.module(id).fetch(path, init)` calls the module's routes on the document's layer with the document's token, always on the server itself and never through a CDN, and answers a plain `Response`, whatever its status. `cloudDocument()` is `null` for a document that isn't open on the cloud engine. `doc.security.allows()` answers for a plugin's own permission: once `/access` answered, from the server's `effectiveScope`, which knows the installed plugins; before, from whether the token names it, or `*`.
