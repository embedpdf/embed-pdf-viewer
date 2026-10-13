---
'@embedpdf/react': minor
---

`<Toolbar>`: a `renderCustom` renderer that draws nothing (`null`) in the measurement layer is left out of it and measured where it renders, by the `ctx.measure` it reports to, instead of counting as 0 px wide.

`useCommand(id)` always gives a command: an id no plugin registered comes back labelled with its id, neither visible nor enabled, the way a turned-off command does, and warns once in development with the closest id there is. A button checks `visible`, never `null`.
