---
'@cloudpdf/engine': patch
---

Page renders draw annotations only when a document token's scope (or `/access`) says the caller may read them; without either, the server decides. `includeFormFields: true` is refused: cloud pictures don't draw form fields yet. `security.allowsAnnotation` treats widgets as form design. Rows the server withholds from the event stream advance the cached manifest's pins and publish no events.
