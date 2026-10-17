---
'@cloudpdf/server': minor
---

`POST /v1/docs/:docId/layers/:layerName/pages/extract` takes `flatten` (`{ usage?: 'display' | 'print' }`), `includeAnnotations` and `includeFormFields`, and returns the pages as they draw for that usage. A flattened copy passes on `doc.download` or `doc.download.flattened` (a signed document refuses the latter), and paints only what the token may read; the include options are refused without `flatten`.
