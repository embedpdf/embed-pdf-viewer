---
'@cloudpdf/server': minor
---

- `POST /v1/docs/:docId/layers/:layerName/form/effects` is removed: a script run's effects are one change, `POST …/changes`.
- A reset of fields already at their defaults, or a display that changes no widget, writes nothing: it can't be undone.
