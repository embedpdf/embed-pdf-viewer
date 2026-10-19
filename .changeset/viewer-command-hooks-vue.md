---
'@embedpdf/vue': minor
---

`useCommand(id)` always gives a command: an id no plugin registered comes back labelled with its id, neither visible nor enabled, the way a turned-off command does, and warns once in development with the closest id there is. A button checks `visible`, never `null`.
