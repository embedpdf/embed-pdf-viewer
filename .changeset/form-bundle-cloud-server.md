---
'@cloudpdf/server': minor
---

Form bundle routes replace `form/data`: `GET …/form/export@:token` (doc and layer, cacheable at the form and layout pins), `POST …/form/export` for a selection a URL can't carry, and multipart `POST …/form/import` and `POST …/form/import-values`, each one change under its `Idempotency-Key`, audited as `form.import` and `form.importValues`. The FDF/XFDF content-type parsers are gone.
