---
'@cloudpdf/engine': minor
---

`doc.forms.export`, `doc.forms.import` and `doc.forms.importValues` over HTTP: the export read at the manifest's pins with the stale-pin retry, the imports as one multipart request each, checked against the server's limits first. Audit rows `form.import` and `form.importValues` become one `forms.created` or `forms.valueSet` event per field.
